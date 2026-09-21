// Bobin / koli etiketinden iplik bilgisi çıkarımı (iplik formundaki "Etiketten doldur").
// Kumaştaki passportExtract ile aynı ilke: model yalnızca OKUR; emin olmadığı alanı boş bırakır.
// Fiyat, stok, MOQ şemada yoktur (etikette yazsa da alınmaz). Kaydetmez; yalnızca öneri döner.
import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { findCertificates, parseComposition } from '../../domain/glossary';
import { LLM_MODELS, LlmNotConfiguredError, LlmOutputError, getAnthropic, isLlmMock } from '../../llm';

const FAMILIES = ['pamuk', 'viskon', 'polyester', 'naylon', 'akrilik', 'yun', 'keten', 'karisim', 'fantezi', 'elastan_gipe', 'diger'] as const;

// API sınırı: en çok 16 birleşim (nullable) alan. Bu yüzden hiçbir alan nullable değil:
// yazmayan metin "", sayı 0, seçenek '' ile gösterilir.
const rawSchema = z.object({
  isYarnLabel: z.boolean().describe('Girdi bir iplik etiketi / iplik bilgisi mi'),
  code: z.string().describe('Ürün ya da kalite kodu, yazdığı gibi. Lot / parti numarası KOD DEĞİLDİR.'),
  family: z.enum(['', ...FAMILIES]).describe('Ana alan. Elastan ve gipe "elastan_gipe"; şönil, buklet, lüreks "fantezi"; iki ve daha çok lif karışımı "karisim".'),
  count: z.number().describe('İplik numarası: 30/1 Ne için 30; 150D/48F için 150; 167 dtex f48 için 167'),
  countUnit: z.enum(['', 'ne', 'nm', 'denye', 'dtex', 'tex']),
  ply: z.number().describe('Kat sayısı: 30/1 için 1, 40/2 için 2. Filament ipliklerde yazmıyorsa 1.'),
  filaments: z.number().describe('Filament sayısı: 150/48 ya da 150D/48F için 48. Kesikli elyaf ipliğinde 0.'),
  spinning: z.enum(['', 'ring', 'kompakt', 'open_end', 'vortex', 'siro']),
  combing: z.enum(['', 'penye', 'karde']).describe('Combed = penye, carded = karde'),
  filamentType: z.enum(['', 'dty', 'fdy', 'poy', 'aty', 'bcf', 'mono']),
  luster: z.enum(['', 'parlak', 'yari_mat', 'mat']).describe('Bright/BR = parlak, semi dull/SD = yari_mat, full dull/FD = mat'),
  twistDirection: z.enum(['', 'S', 'Z']),
  twistTpm: z.number().describe('Büküm, tur/metre (T/m, TPM). T/inç ise 0 bırak ve notes\'a yaz.'),
  colorState: z.enum(['', 'ham', 'boyali', 'melanj', 'elyaf_boyali', 'dope_dyed']).describe('Raw white / ham = ham; dope dyed / DD = dope_dyed'),
  color: z.string().describe('Renk adı ya da renk kodu, yazdığı gibi'),
  composition: z.string().describe('Lif içeriği yazdığı gibi, tek satır: "100% Cotton", "%65 PES %35 CO". Toplamı düzeltme.'),
  variety: z.string().describe('Fantezi / gipe / özel iplikte çeşit ya da yapı tarifi, yazdığı gibi'),
  brand: z.string().describe('Üretici markası'),
  origin: z.string().describe('Menşe ülke (Made in ...), Türkçe yaz: Türkiye, Çin, Hindistan...'),
  coneWeightKg: z.number().describe('Bobin net ağırlığı, kg'),
  certificates: z.string().describe('Sertifika adları virgülle: "GOTS, OEKO-TEX Standard 100"'),
  confidence: z.number().describe('0-1 arası genel güven: etiket net okunuyorsa yüksek'),
  notes: z.string().describe('Alanlara sığmayan gözlemler, kısa ve Türkçe: lot numarası, çevrilmeyen birimler, okunamayan yerler. Yoksa boş dize.'),
});
type Raw = z.infer<typeof rawSchema>;

const SYSTEM = `Sen bir tekstil uzmanısın. Sana bir iplik bobin / koli etiketi fotoğrafı ya da iplik bilgisi metni verilecek. YALNIZCA yazanı oku ve alanlara aktar.
Kurallar:
- Yazmayan ya da emin olmadığın alanı BOŞ bırak (metin "", sayı 0, seçenek ""); tahmin yürütme.
- Fiyat, stok, miktar, sipariş bilgisi aktarma (şemada yok).
- "30/1" tek başına yazıyorsa ve pamuk/kesikli elyaf bağlamıysa birim Ne; "150/48" biçimi filament ipliktir (150 denye, 48 filament).
- Lot / parti / barkod numarası kod değildir; notes'a yaz.
- Etiket iplikle ilgili değilse isYarnLabel=false ve confidence düşük.`;

export type YarnLabelMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
export interface YarnExtractInput {
  images: { data: string; mediaType: YarnLabelMediaType }[];
  text: string | null;
}

// Sahte kip: metin "YARN:{json}" ise o ham çıktı kullanılır (testler böyle besler).
function mockRaw(input: YarnExtractInput): Raw {
  const base: Raw = {
    isYarnLabel: true, code: '', family: '', count: 0, countUnit: '', ply: 0, filaments: 0, spinning: '', combing: '', filamentType: '', luster: '',
    twistDirection: '', twistTpm: 0, colorState: '', color: '', composition: '', variety: '', brand: '', origin: '', coneWeightKg: 0, certificates: '', confidence: 0.9, notes: '',
  };
  const text = input.text ?? '';
  if (text.startsWith('YARN:')) {
    try {
      return { ...base, ...JSON.parse(text.slice(5)) };
    } catch {
      return base;
    }
  }
  return base;
}

const positive = (n: number, max: number) => (Number.isFinite(n) && n > 0 && n <= max ? n : null);
const clean = (s: string, max: number) => (s ? s.trim().slice(0, max) : '');

export async function runYarnExtract(input: YarnExtractInput) {
  let raw: Raw;
  let model = 'mock';
  if (isLlmMock()) {
    raw = mockRaw(input);
  } else {
    const client = getAnthropic();
    if (!client) throw new LlmNotConfiguredError();
    const content: Anthropic.ContentBlockParam[] = input.images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } }));
    content.push({ type: 'text', text: input.text ? `İplik bilgisi metni:\n${input.text}` : 'Bu iplik etiketini oku.' });
    const message = await client.messages.parse({
      model: LLM_MODELS.extract,
      max_tokens: 1500,
      system: SYSTEM,
      output_config: { effort: 'low', format: zodOutputFormat(rawSchema) },
      messages: [{ role: 'user', content }],
    });
    if (!message.parsed_output) throw new LlmOutputError(`model iplik çıktısı vermedi (stop_reason: ${message.stop_reason})`);
    raw = message.parsed_output;
    model = LLM_MODELS.extract;
  }

  // Deterministik son işlem: aralık denetimi, kompozisyonun sözlükten geçmesi, tutarlılık.
  const composition = raw.composition ? parseComposition(raw.composition) : null;
  const items = composition?.items ?? [];
  const total = items.reduce((s, c) => s + c.percent, 0);
  const warnings: string[] = [];
  if (items.length && Math.abs(total - 100) > 0.5) warnings.push('composition_total_not_100');
  const count = positive(raw.count, 100000);
  if (count != null && !raw.countUnit) warnings.push('count_unit_missing');
  const filaments = positive(raw.filaments, 5000);

  return {
    recognized: raw.isYarnLabel && raw.confidence >= 0.3,
    confidence: Math.max(0, Math.min(1, raw.confidence)),
    // Yalnızca DOLU alanlar döner; form boş alanlara dokunmaz.
    suggestion: {
      code: clean(raw.code, 40),
      family: raw.family,
      count,
      countUnit: count != null ? raw.countUnit : '',
      ply: positive(raw.ply, 12) != null ? Math.round(raw.ply) : null,
      filaments: filaments != null ? Math.round(filaments) : null,
      spinning: raw.spinning,
      combing: raw.combing,
      filamentType: raw.filamentType,
      luster: raw.luster,
      twistDirection: raw.twistDirection,
      twistTpm: positive(raw.twistTpm, 10000),
      colorState: raw.colorState,
      color: clean(raw.color, 60),
      // Toplamı 100 olmayan kompozisyon forma aktarılmaz (sunucu zaten reddeder); metni notlarda kalır.
      composition: items.length && Math.abs(total - 100) <= 0.5 ? items.map((c) => ({ fiber: c.fiber, percent: c.percent })) : [],
      compositionText: clean(raw.composition, 120),
      variety: clean(raw.variety, 120),
      brand: clean(raw.brand, 60),
      origin: clean(raw.origin, 60),
      coneWeightKg: positive(raw.coneWeightKg, 100),
      // Sözlükte tanınan sertifikalar anahtarlarıyla; tanınmayanlar metinde kalır.
      certificates: raw.certificates ? [...new Set(findCertificates(raw.certificates).map((m) => m.key))] : [],
      certificatesText: clean(raw.certificates, 200),
    },
    warnings,
    notes: clean(raw.notes, 500),
    meta: { model, mock: model === 'mock' },
  };
}
