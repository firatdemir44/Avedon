// Beceri 9: Sipariş için gereken iplik kilosu (metre kumaş → kg iplik).
import * as z from 'zod/v4';
import { calculateYarnUsageKg } from '../../domain/calc/formulas';
import { metersPerKg, metersToKg } from '../../domain/glossary/units';
import { defineSkill, fmt } from '../types';

const inputSchema = z.object({
  fabricLengthMeters: z.number().positive().describe('Üretilecek kumaş uzunluğu (metre)'),
  weightGsm: z.number().positive().describe('Kumaşın gramajı (gr/m²)'),
  widthCm: z.number().positive().describe('Kumaşın eni (cm)'),
  wastagePercent: z.number().min(0).max(100).default(0).describe('Örme/işlem firesi (%); yoksa 0'),
});

interface YarnUsageOutput {
  yarnKg: number;
  kgPerMeter: number;
  metersPerKg: number;
}

export const yarnUsage = defineSkill<typeof inputSchema, YarnUsageOutput>({
  name: 'yarnUsage',
  title: 'Gereken iplik kilosu',
  description:
    'Belli metre kumaş üretmek için kaç kilo iplik gerektiğini hesaplar; gramaj, en ve fire oranından. ' +
    'Kullan: "1.000 metre için kaç kilo iplik almalıyım", "bu siparişe ne kadar iplik gider" gibi sorularda. ' +
    'Fire oranını kullanıcı verir, tahmin etme. İplik fiyatı ya da maliyet hesaplamaz (bunun için fabricPricing).',
  formula:
    '1 metre kumaşın ağırlığı (kg) = gramaj × en(cm) / 100.000. Gereken iplik = metre × metre ağırlığı × (1 + fire).',
  inputSchema,
  run: (input) => ({
    yarnKg: calculateYarnUsageKg(input),
    kgPerMeter: metersToKg(1, input.weightGsm, input.widthCm),
    metersPerKg: metersPerKg(input.weightGsm, input.widthCm),
  }),
  summarize: (input, out) =>
    `${fmt(input.weightGsm, 0)} gr/m², ${fmt(input.widthCm, 0)} cm ende 1 metre ${fmt(out.kgPerMeter, 3)} kg gelir ` +
    `(1 kg ≈ ${fmt(out.metersPerKg)} m); ${fmt(input.fabricLengthMeters, 0)} metre için fire %${fmt(input.wastagePercent, 1)} dahil ` +
    `${fmt(out.yarnKg)} kg iplik gerekir.`,
});
