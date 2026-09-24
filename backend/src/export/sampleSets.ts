// Kartela önerisi (2026-10-04): alıcı profiline göre firmanın kataloğundan ilk numune seti.
// Model yalnızca VERİLEN ürün kimliklerinden seçer; bilinmeyen kimlikler atılır. Herkese açık
// görünüm (numune-seti.html) fiyat, stok, MOQ, termin ve iç notları ASLA içermez.
import { randomBytes } from 'node:crypto';
import { z } from 'zod/v4';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { FINISH_TAGS, SUBTYPES, TYPE_LABELS, USAGES, type ProductType } from '../catalog';
import { prisma } from '../db';
import { fiberLabel } from '../domain/glossary';
import { t, type Lang } from '../i18n';
import { LLM_MODELS, LlmNotConfiguredError, LlmOutputError, getAnthropic, isLlmMock } from '../llm';
import { fetchPreview } from '../linkPreview';
import { parseFinishTags } from '../passport';
import { parseUsages } from '../products';
import { YARN_PRODUCT_TYPE, YARN_SPEC_SELECT, toYarnSpecRow } from '../yarns';
import { passportUrl, publicBase } from '../routes/dpp';
import { INDUSTRIES, SEGMENT_LABEL, type Segment } from './buyers/segments';
import { countryByIso2 } from './countries';

export const MAX_SUGGESTS_PER_DAY = 20;
export const CATALOG_LIMIT = 200;
export const MIN_ITEMS = 5;
export const MAX_ITEMS = 10;
export const SAMPLE_SET_STATUSES = ['taslak', 'gonderildi'] as const;

export interface SampleItem {
  productId: string;
  score: number;
  reason: string;
  selected: boolean;
}

export const CATALOG_SELECT = {
  id: true,
  code: true,
  type: true,
  subtype: true,
  weightGsm: true,
  widthCm: true,
  stock: true,
  stockUnit: true,
  usages: true,
  finishTags: true,
  content: true,
  compositions: { select: { fiber: true, percent: true }, orderBy: { position: 'asc' as const } },
  yarnSpec: { select: YARN_SPEC_SELECT },
  _count: { select: { images: true } },
};

export type CatalogRow = {
  id: string;
  code: string;
  type: string;
  subtype: string;
  weightGsm: number | null;
  widthCm: number | null;
  stock: number | null;
  stockUnit: string;
  usages: string;
  finishTags: string;
  content: string;
  compositions: { fiber: string; percent: number }[];
  yarnSpec: Parameters<typeof toYarnSpecRow>[0];
  _count: { images: number };
};

// ---- Etiketler ----

export function typeLabel(p: Pick<CatalogRow, 'type'>, lang: Lang) {
  return p.type === YARN_PRODUCT_TYPE ? t(lang, 'İplik') : t(lang, TYPE_LABELS[p.type as ProductType] ?? p.type);
}

export function subtypeLabel(p: Pick<CatalogRow, 'type' | 'subtype' | 'yarnSpec'>, lang: Lang) {
  if (p.type === YARN_PRODUCT_TYPE) return toYarnSpecRow(p.yarnSpec)?.summary ?? '';
  const l = (SUBTYPES[p.type as ProductType] ?? []).find((s) => s.key === p.subtype)?.label;
  return l ? t(lang, l) : '';
}

export function compositionText(p: Pick<CatalogRow, 'compositions'>, lang: Lang) {
  return p.compositions.map((c) => (lang === 'en' ? `${c.percent}% ` : `%${c.percent} `) + t(lang, fiberLabel(c.fiber))).join(', ');
}

const finishLabels = (raw: string, lang: Lang) => parseFinishTags(raw).map((k) => t(lang, FINISH_TAGS.find((f) => f.key === k)?.label ?? k));
const usageLabels = (raw: string, lang: Lang) => parseUsages(raw).map((k) => t(lang, USAGES.find((u) => u.key === k)?.label ?? k));

// Firma içi ürün satırı (mobil liste): stok görünür, fiyat yok.
export function toItemProduct(p: CatalogRow, lang: Lang) {
  return {
    id: p.id,
    code: p.code,
    type: p.type,
    typeLabel: typeLabel(p, lang),
    subtypeLabel: subtypeLabel(p, lang),
    composition: compositionText(p, lang),
    weightGsm: p.weightGsm,
    widthCm: p.widthCm,
    stock: p.stock,
    stockUnit: p.stockUnit,
    hasImage: p._count.images > 0,
  };
}

// Alıcıya giden satır: YALNIZ teknik alanlar + pasaport bağlantısı.
export function toPublicItem(p: CatalogRow, lang: Lang) {
  return {
    id: p.id,
    hasImage: p._count.images > 0,
    code: p.code,
    type: typeLabel(p, lang),
    subtype: subtypeLabel(p, lang),
    composition: compositionText(p, lang),
    weightGsm: p.type === YARN_PRODUCT_TYPE ? null : p.weightGsm,
    widthCm: p.type === YARN_PRODUCT_TYPE ? null : p.widthCm,
    finishes: finishLabels(p.finishTags, lang),
    usages: usageLabels(p.usages, lang),
    passportUrl: passportUrl(p.id),
  };
}

// ---- Katalog ve alıcı profili ----

export async function loadCatalog(companyId: string): Promise<CatalogRow[]> {
  const rows = await prisma.product.findMany({
    where: { companyId, stock: { gt: 0 } }, // numune setine yalnız stoklu ürün
    select: CATALOG_SELECT,
    orderBy: [{ stock: 'desc' }, { createdAt: 'desc' }],
    take: CATALOG_LIMIT,
  });
  return rows as unknown as CatalogRow[];
}

function compactLine(p: CatalogRow) {
  const parts = [
    `id=${p.id}`,
    `kod=${p.code || '-'}`,
    `çeşit=${typeLabel(p, 'tr')}${subtypeLabel(p, 'tr') ? '/' + subtypeLabel(p, 'tr') : ''}`,
    compositionText(p, 'tr') && `içerik=${compositionText(p, 'tr')}`,
    p.weightGsm ? `${p.weightGsm} g/m²` : '',
    p.widthCm ? `en ${p.widthCm} cm` : '',
    finishLabels(p.finishTags, 'tr').length ? `apre=${finishLabels(p.finishTags, 'tr').join('/')}` : '',
    usageLabels(p.usages, 'tr').length ? `kullanım=${usageLabels(p.usages, 'tr').join('/')}` : '',
    p.stock ? `stok=${p.stock} ${p.stockUnit}` : 'stok=yok',
    p.content ? `not=${p.content.replace(/\s+/g, ' ').slice(0, 80)}` : '',
  ];
  return '- ' + parts.filter(Boolean).join('; ');
}

export interface BuyerProfile {
  name: string;
  countryIso2: string;
  city: string;
  website: string;
  segment: string;
  industryCode: string;
  sizeLabel: string;
  revenueEur: number | null;
  source: string;
}

export function industryLabel(code: string) {
  return INDUSTRIES.find((i) => i.naf === code || i.sic.includes(code))?.label ?? '';
}

export function buyerProfileText(b: BuyerProfile, websiteText: string) {
  const country = countryByIso2(b.countryIso2);
  return [
    `Ad: ${b.name}`,
    `Ülke: ${country?.name ?? b.countryIso2}${b.city ? `, ${b.city}` : ''}`,
    `Tür: ${SEGMENT_LABEL[b.segment as Segment] ?? b.segment}`,
    b.industryCode ? `Faaliyet kodu: ${b.industryCode}${industryLabel(b.industryCode) ? ` (${industryLabel(b.industryCode)})` : ''}` : '',
    b.sizeLabel ? `Büyüklük: ${b.sizeLabel}` : '',
    b.revenueEur ? `Ciro: ~${Math.round(b.revenueEur / 1e6)} milyon EUR` : '',
    b.website ? `Web: ${b.website}` : '',
    websiteText ? `Web sitesi açıklaması: ${websiteText}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function websiteText(website: string): Promise<string> {
  if (!website) return '';
  try {
    const p = await Promise.race([fetchPreview(website), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))]);
    return [p.title, p.description].filter(Boolean).join(' — ').slice(0, 500);
  } catch {
    return '';
  }
}

// ---- Model ----

const outputSchema = z.object({
  summary: z.string(),
  items: z.array(z.object({ productId: z.string(), score: z.number(), reason: z.string() })),
});
export type SuggestOutput = z.infer<typeof outputSchema>;

export function systemPrompt(lang: Lang) {
  const language = lang === 'en' ? 'English' : 'Türkçe';
  return `Sen deneyimli bir Türk tekstil ihracat satış temsilcisisin. Bir yabancı alıcıya gönderilecek İLK kartela (numune) setini seçiyorsun.
Sana alıcının profili (tür: konfeksiyon/marka/toptancı vb., faaliyet kodu, büyüklük, ülke, web sitesi metni) ve satıcı firmanın kataloğu verilecek.
Görevin:
- Alıcıya en uygun 5-10 ürünü seç (katalogda 5'ten az ürün varsa hepsini değerlendir). Çeşitlilik gözet: aynı ürünün kopyalarını doldurma.
- Her ürüne 0-100 uyum puanı ver ve tek cümlelik gerekçe yaz.
- Alıcının muhtemel ihtiyacını 1-2 cümlede özetle (summary).
Kurallar:
- YALNIZCA katalogda verilen productId değerlerini kullan; ürün uydurma, kimliği değiştirme.
- Tanınmış markalar (ör. Burberry, Zara) hakkında genel bilgini kullanabilirsin; ama çıkarım yapıyorsan cümlede "tahmin" de. Alıcı hakkında bilgi yoksa segment ve ülkeden genel çıkarım yap ve bunu belirt.
- Stokta olan ürünler numune için avantajlıdır; kompozisyon, gramaj, apre ve kullanım alanını alıcının ürün gamıyla eşleştir.
- Gerekçeler ve özet ${language} olsun; kısa ve somut yaz.`;
}

export function mockSuggest(catalog: CatalogRow[], lang: Lang): SuggestOutput {
  return {
    summary: t(lang, 'Deneme kipi: ilk ürünler önerildi.'),
    items: catalog.slice(0, MIN_ITEMS).map((p, i) => ({ productId: p.id, score: 90 - i * 5, reason: t(lang, 'Deneme kipi önerisi.') })),
  };
}

// Kimlikleri doğrular: firmaya ait olmayan/tekrar eden atılır, puan 0-100'e sıkıştırılır, en çok 10.
export function validateItems(raw: SuggestOutput['items'], allowedIds: ReadonlySet<string>): SampleItem[] {
  const seen = new Set<string>();
  const out: SampleItem[] = [];
  for (const it of raw) {
    if (!allowedIds.has(it.productId) || seen.has(it.productId)) continue;
    seen.add(it.productId);
    const score = Math.max(0, Math.min(100, Math.round(Number.isFinite(it.score) ? it.score : 0)));
    out.push({ productId: it.productId, score, reason: String(it.reason ?? '').trim().slice(0, 300), selected: true });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, MAX_ITEMS);
}

export async function suggestForBuyer(buyer: BuyerProfile, catalog: CatalogRow[], lang: Lang): Promise<{ output: SuggestOutput; model: string }> {
  if (isLlmMock()) return { output: mockSuggest(catalog, lang), model: 'mock' };
  const client = getAnthropic();
  if (!client) throw new LlmNotConfiguredError();
  const site = await websiteText(buyer.website);
  const message = await client.messages.parse({
    model: LLM_MODELS.chat,
    max_tokens: 3000,
    system: systemPrompt(lang),
    output_config: { effort: 'low', format: zodOutputFormat(outputSchema) },
    messages: [
      {
        role: 'user',
        content: `ALICI PROFİLİ\n${buyerProfileText(buyer, site)}\n\nKATALOG (${catalog.length} ürün)\n${catalog.map(compactLine).join('\n')}\n\nBu alıcı için ilk kartela setini seç.`,
      },
    ],
  });
  const parsed = message.parsed_output ?? null;
  if (!parsed) throw new LlmOutputError(`model kartela önerisi vermedi (stop_reason: ${message.stop_reason})`);
  return { output: parsed, model: LLM_MODELS.chat };
}

// ---- Kayıt görünümleri ----

export function parseItems(raw: string): SampleItem[] {
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter((x): x is SampleItem => !!x && typeof x === 'object' && typeof (x as SampleItem).productId === 'string')
      .map((x) => ({ productId: x.productId, score: Number(x.score) || 0, reason: String(x.reason ?? ''), selected: x.selected !== false }));
  } catch {
    return [];
  }
}

export const newShareToken = () => randomBytes(18).toString('base64url');
export const shareUrl = (token: string) => `${publicBase()}/numune-seti.html?t=${encodeURIComponent(token)}`;

type SetRow = { id: string; buyerId: string; title: string; itemsJson: string; summary: string; lang: string; shareToken: string | null; status: string; createdAt: Date; updatedAt: Date };

export async function toSetView(set: SetRow, lang: Lang, companyId: string) {
  const items = parseItems(set.itemsJson);
  const products = (await prisma.product.findMany({ where: { id: { in: items.map((i) => i.productId) }, companyId }, select: CATALOG_SELECT })) as unknown as CatalogRow[];
  const byId = new Map(products.map((p) => [p.id, p]));
  return {
    id: set.id,
    buyerId: set.buyerId,
    title: set.title,
    summary: set.summary,
    lang: set.lang,
    status: set.status,
    shareUrl: set.shareToken ? shareUrl(set.shareToken) : null,
    createdAt: set.createdAt,
    updatedAt: set.updatedAt,
    // Sonradan silinen ürün sessizce düşer.
    items: items.filter((i) => byId.has(i.productId)).map((i) => ({ ...i, product: toItemProduct(byId.get(i.productId)!, lang) })),
  };
}
