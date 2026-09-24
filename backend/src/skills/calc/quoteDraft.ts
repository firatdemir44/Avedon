// Beceri 12: Teklif taslağı (Faz 2, Adım 2). Saf hesap: ürünün kayıtlı fiyatı,
// MOQ ve termininden, istenen miktar ve birime göre teklif satırı üretir.
// İlke: fiyat UYDURULMAZ. Üründe fiyat yoksa birim fiyat null döner ve satıcıya sorulur.
import * as z from 'zod/v4';
import { metersPerKg } from '../../domain/glossary/units';
import { defineSkill, fmt } from '../types';
import { t } from '../../i18n';

const unit = z.enum(['m', 'kg']);

const inputSchema = z.object({
  quantity: z.number().positive().describe('Alıcının istediği miktar'),
  unit: unit.describe('İstenen miktarın birimi: m ya da kg'),
  priceValue: z.number().nonnegative().optional().describe('Satıcının birim fiyatı; bilinmiyorsa verme (uydurma)'),
  priceCurrency: z.enum(['TRY', 'USD', 'EUR']).optional().describe('Fiyatın para birimi'),
  priceUnit: unit.optional().describe('Fiyat hangi birim başına: m ya da kg'),
  weightGsm: z.number().positive().optional().describe('Gramaj (gr/m²); fiyat birimi ile istenen birim farklıysa çeviri için'),
  widthCm: z.number().positive().optional().describe('Hesap eni (açık en, cm); birim çevirisi için'),
  moq: z.number().positive().optional().describe('Satıcının en az sipariş miktarı'),
  moqUnit: unit.optional(),
  leadTimeDays: z.number().int().min(0).max(365).optional().describe('Termin (gün)'),
  validityDays: z.number().int().min(1).max(90).default(15).describe('Teklifin geçerlilik süresi (gün)'),
});

export interface QuoteDraftOutput {
  // İstenen birim başına fiyat; fiyat yoksa ya da çevrilemiyorsa null.
  unitPrice: number | null;
  currency: string | null;
  unit: 'm' | 'kg';
  total: number | null;
  converted: boolean;
  metersPerKg: number | null;
  moq: number | null;
  moqUnit: string | null;
  belowMoq: boolean;
  leadTimeDays: number | null;
  validityDays: number;
  missing: string[];
}

export function computeQuoteDraft(input: z.infer<typeof inputSchema>): QuoteDraftOutput {
  const missing: string[] = [];
  const mpk = input.weightGsm && input.widthCm ? metersPerKg(input.weightGsm, input.widthCm) : null;

  let unitPrice: number | null = null;
  let converted = false;
  if (input.priceValue == null || !input.priceCurrency || !input.priceUnit) {
    missing.push('fiyat');
  } else if (input.priceUnit === input.unit) {
    unitPrice = input.priceValue;
  } else if (mpk) {
    // kg fiyatı → metre fiyatı: fiyat / (metre/kg); metre fiyatı → kg fiyatı: fiyat × (metre/kg)
    unitPrice = input.priceUnit === 'kg' ? input.priceValue / mpk : input.priceValue * mpk;
    converted = true;
  } else {
    missing.push('birim çevirisi için gramaj ve en');
  }

  // MOQ karşılaştırması aynı birimde ya da çevrilebiliyorsa yapılır.
  let belowMoq = false;
  if (input.moq != null && input.moqUnit) {
    let moqInRequestUnit: number | null = null;
    if (input.moqUnit === input.unit) moqInRequestUnit = input.moq;
    else if (mpk) moqInRequestUnit = input.moqUnit === 'kg' ? input.moq * mpk : input.moq / mpk;
    if (moqInRequestUnit != null) belowMoq = input.quantity < moqInRequestUnit;
  }
  if (input.leadTimeDays == null) missing.push('termin');

  return {
    unitPrice,
    currency: unitPrice != null ? (input.priceCurrency ?? null) : null,
    unit: input.unit,
    total: unitPrice != null ? unitPrice * input.quantity : null,
    converted,
    metersPerKg: mpk,
    moq: input.moq ?? null,
    moqUnit: input.moqUnit ?? null,
    belowMoq,
    leadTimeDays: input.leadTimeDays ?? null,
    validityDays: input.validityDays,
    missing,
  };
}

export const quoteDraft = defineSkill<typeof inputSchema, QuoteDraftOutput>({
  name: 'quoteDraft',
  title: 'Teklif taslağı',
  description:
    'Bir teklif isteği için taslak satırı hazırlar: satıcının kayıtlı birim fiyatını istenen birime (m ↔ kg) çevirir, toplamı hesaplar, MOQ altında kalıp kalmadığını ve termini belirtir. ' +
    'Kullan: satıcı "bu isteğe teklif hazırla", "500 kg için toplam ne eder" dediğinde. Fiyatı ASLA uydurma: üründe ya da hafızada fiyat yoksa priceValue verme, araç eksik olarak bildirir ve kullanıcıya sorarsın. ' +
    'Alıcıya fiyat söylemek için kullanılmaz; fiyat yalnızca satıcının onayladığı teklifle gider.',
  formula:
    'Birim aynıysa birim fiyat = kayıtlı fiyat. kg fiyatı → metre: fiyat / (metre/kg); metre fiyatı → kg: fiyat × (metre/kg); metre/kg = 100.000 / (gramaj × en). Toplam = birim fiyat × miktar.',
  inputSchema,
  run: (input) => computeQuoteDraft(input),
  summarize: (input, out, lang) => {
    const parts: string[] = [];
    if (out.unitPrice != null) {
      parts.push(
        t(lang, '{q} {unit} için birim fiyat {price} {cur}/{unit}{conv}, toplam {total} {cur}', {
          q: fmt(input.quantity),
          unit: out.unit,
          price: fmt(out.unitPrice, 3),
          cur: out.currency ?? '',
          conv: out.converted ? t(lang, ' (birim çevrildi)') : '',
          total: fmt(out.total),
        })
      );
    } else {
      parts.push(t(lang, '{q} {unit} için fiyat hesaplanamadı', { q: fmt(input.quantity), unit: out.unit }));
    }
    if (out.belowMoq) parts.push(t(lang, "istenen miktar MOQ'nun ({moq} {unit}) altında", { moq: fmt(out.moq), unit: out.moqUnit ?? '' }));
    if (out.leadTimeDays != null) parts.push(t(lang, 'termin {n} gün', { n: out.leadTimeDays }));
    parts.push(t(lang, 'geçerlilik {n} gün', { n: out.validityDays }));
    if (out.missing.length) parts.push(t(lang, 'eksik: {list}', { list: out.missing.map((m) => t(lang, m)).join(', ') }));
    return parts.join('; ') + '.';
  },
});
