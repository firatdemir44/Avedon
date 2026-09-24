// Beceri 1: Kumaş maliyeti ve satış fiyatı (kg bazlı; gramaj+en verilirse metre).
import * as z from 'zod/v4';
import { calculateFabricPricing, type FabricPricingResult } from '../../domain/calc/formulas';
import { defineSkill, fmt } from '../types';

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
  summarize: (input, out) => {
    const parts = [
      `İplik maliyeti ${fmt(out.yarnCostPerKg.TRY)} TRY/kg`,
      `ham maliyet ${fmt(out.greigeCostPerKg.TRY)} TRY/kg, ham satış ${fmt(out.greigeSalePerKg.TRY)} TRY/kg`,
      `boyalı maliyet ${fmt(out.dyedCostPerKg.TRY)} TRY/kg, boyalı satış ${fmt(out.dyedSalePerKg.TRY)} TRY/kg`,
    ];
    if (out.dyedSalePerKg.USD != null) parts.push(`(boyalı satış ${fmt(out.dyedSalePerKg.USD)} USD/kg)`);
    if (out.metersPerKg != null) {
      parts.push(`1 kg ≈ ${fmt(out.metersPerKg)} m, boyalı satış ${fmt(out.dyedSalePerKg.TRY / out.metersPerKg)} TRY/m`);
    }
    if (Math.round(out.ratioTotal) !== 100) parts.push(`Dikkat: iplik oranları toplamı %${fmt(out.ratioTotal)}, 100 olmalı`);
    return parts.join('; ') + '.';
  },
});
