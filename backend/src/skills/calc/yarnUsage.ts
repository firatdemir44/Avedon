// Beceri 9: Metre kumaş için iplik kilosu (tek fire ile hızlı hesap).
// Fireleri ayrı ayrı (örme, boya/apre, kesim) hesaba katmak için yarnRequirement.
import * as z from 'zod/v4';
import { calculateYarnUsageKg } from '../../domain/calc/formulas';
import { effectiveWidthCm } from '../../domain/calc/wastage';
import { metersPerKg, metersToKg } from '../../domain/glossary/units';
import { defineSkill, fmt } from '../types';
import { t } from '../../i18n';

const inputSchema = z.object({
  fabricLengthMeters: z.number().positive().describe('Üretilecek kumaş uzunluğu (metre)'),
  weightGsm: z.number().positive().describe('Kumaşın gramajı (gr/m²)'),
  widthCm: z.number().positive().describe('Kumaşın eni (cm), kullanıcının söylediği gibi'),
  widthMeaning: z
    .enum(['acik', 'tup_tek_yuz'])
    .default('acik')
    .describe('"acik" = açık en; "tup_tek_yuz" = tek yüz tüp eni (iki katı alınır). Tüp kumaşta kullanıcıya sor.'),
  wastagePercent: z.number().min(0).max(100).default(0).describe('Tek toplam fire (%), metre üstüne eklenir; fireler ayrı verilecekse yarnRequirement kullan'),
});

interface YarnUsageOutput {
  effectiveWidthCm: number;
  yarnKg: number;
  kgPerMeter: number;
  metersPerKg: number;
}

export const yarnUsage = defineSkill<typeof inputSchema, YarnUsageOutput>({
  name: 'yarnUsage',
  title: 'Gereken iplik kilosu',
  description:
    'Belli metre kumaş için kaç kilo iplik gerektiğini hızlıca hesaplar; gramaj, en ve tek bir toplam fire oranından. ' +
    'Kullan: "1.000 metre için kaç kilo iplik almalıyım" gibi hızlı sorularda. Örme, boya/apre ve kesim firelerini ayrı ayrı hesaba katmak gerekiyorsa yarnRequirement aracını kullan. ' +
    'Fire oranını kullanıcı verir ya da firma hafızasından gelir; tahmin etme. Fiyat hesaplamaz.',
  formula:
    'Hesap eni = açık en (tek yüz tüp eni × 2). 1 metre ağırlığı (kg) = gramaj × en / 100.000. Gereken iplik = metre × metre ağırlığı × (1 + fire).',
  inputSchema,
  run: (input) => {
    const width = effectiveWidthCm(input.widthCm, input.widthMeaning);
    return {
      effectiveWidthCm: width,
      yarnKg: calculateYarnUsageKg({ ...input, widthCm: width }),
      kgPerMeter: metersToKg(1, input.weightGsm, width),
      metersPerKg: metersPerKg(input.weightGsm, width),
    };
  },
  summarize: (input, out, lang) =>
    t(lang, '{gsm} gr/m², {w} cm açık ende 1 metre {kpm} kg gelir (1 kg ≈ {mpk} m); {m} metre için fire %{loss} dahil {kg} kg iplik gerekir.', {
      gsm: fmt(input.weightGsm, 0),
      w: fmt(out.effectiveWidthCm, 0),
      kpm: fmt(out.kgPerMeter, 3),
      mpk: fmt(out.metersPerKg),
      m: fmt(input.fabricLengthMeters, 0),
      loss: fmt(input.wastagePercent, 1),
      kg: fmt(out.yarnKg),
    }),
});
