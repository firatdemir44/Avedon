// Beceri 1: Kumaş maliyeti ve satış fiyatı (kg bazlı; gramaj+en verilirse metre).
import * as z from 'zod/v4';
import { calculateFabricPricing, type FabricPricingResult } from '../../domain/calc/formulas';
import { defineSkill, fmt } from '../types';
import { t } from '../../i18n';

const currency = z.enum(['TRY', 'USD', 'EUR']);

const inputSchema = z.object({
  yarns: z
    .array(
      z.object({
        price: z.number().nonnegative().describe('İplik kg fiyatı'),
        currency: currency.describe('Fiyatın para birimi'),
        ratioPercent: z.number().min(0).max(100).describe('Bu ipliğin kumaştaki ağırlık payı (%)'),
        wastagePercent: z.number().min(0).max(100).default(0).describe('İplik firesi (%), yoksa 0'),
      })
    )
    .min(1)
    .max(8)
    .describe('Kumaşı oluşturan iplikler; oranların toplamı 100 olmalı'),
  usdTry: z.number().nonnegative().default(0).describe('USD/TRY kuru; kullanıcı ayrıca söylemediyse 0 bırak (TCMB döviz satış otomatik)'),
  eurTry: z.number().nonnegative().default(0).describe('EUR/TRY kuru; kullanıcı ayrıca söylemediyse 0 bırak (TCMB döviz satış otomatik)'),
  knittingFeePerKg: z.number().nonnegative().default(0).describe('Örme fason ücreti (TRY/kg)'),
  overheadPercent: z.number().min(0).max(100).default(0).describe('Genel gider oranı (%)'),
  dyeingFeePerKg: z.number().nonnegative().default(0).describe('Boya fason ücreti (TRY/kg, ham kilo üzerinden)'),
  dyeingLossPercent: z.number().min(0).max(99.9).default(0).describe('Boya firesi (%), kilo kaybı'),
  profitPercent: z.number().min(0).max(500).default(0).describe('Kâr oranı (%)'),
  weightGsm: z.number().positive().optional().describe('Gramaj (gr/m²); metre fiyatı istenirse'),
  widthCm: z.number().positive().optional().describe('En (cm); metre fiyatı istenirse'),
});

export const fabricPricing = defineSkill<typeof inputSchema, FabricPricingResult>({
  name: 'fabricPricing',
  title: 'Kumaş maliyeti',
  description:
    'Örme kumaşın kg başına iplik maliyetini, ham (örülmüş) maliyet ve satış fiyatını, boyalı maliyet ve satış fiyatını hesaplar; gramaj ve en verilirse metre başına da çevirir. ' +
    'Kullan: "bu kumaşın maliyeti ne olur", "boyalı satış fiyatı", "kg fiyatını metreye çevir" gibi sorularda. ' +
    'Fiyat, fason ücreti, fire ve kâr oranını kullanıcı verir; hiçbirini tahmin etme, eksikse sor. Kur verilmezse (0) sunucu TCMB döviz satış kurunu kullanır.',
  formula:
    'İplik maliyeti = Σ fiyat(TRY) × oran × (1 + iplik firesi). Ham maliyet = (iplik + örme fason) × (1 + genel gider). ' +
    'Boyalı maliyet = (ham maliyet + boya fason) / (1 − boya firesi). Satış = maliyet × (1 + kâr). Metre/kg = 100.000 / (gramaj × en).',
  inputSchema,
  run: (input) => calculateFabricPricing(input),
  summarize: (input, out, lang) => {
    const parts = [
      t(lang, 'İplik maliyeti {v} TRY/kg', { v: fmt(out.yarnCostPerKg.TRY) }),
      t(lang, 'ham maliyet {c} TRY/kg, ham satış {s} TRY/kg', { c: fmt(out.greigeCostPerKg.TRY), s: fmt(out.greigeSalePerKg.TRY) }),
      t(lang, 'boyalı maliyet {c} TRY/kg, boyalı satış {s} TRY/kg', { c: fmt(out.dyedCostPerKg.TRY), s: fmt(out.dyedSalePerKg.TRY) }),
    ];
    if (out.dyedSalePerKg.USD != null) parts.push(t(lang, '(boyalı satış {v} USD/kg)', { v: fmt(out.dyedSalePerKg.USD) }));
    if (out.metersPerKg != null) {
      parts.push(t(lang, '1 kg ≈ {mpk} m, boyalı satış {v} TRY/m', { mpk: fmt(out.metersPerKg), v: fmt(out.dyedSalePerKg.TRY / out.metersPerKg) }));
    }
    if (Math.round(out.ratioTotal) !== 100) parts.push(t(lang, 'Dikkat: iplik oranları toplamı %{v}, 100 olmalı', { v: fmt(out.ratioTotal) }));
    return parts.join('; ') + '.';
  },
});
