// Beceri 6: Numuneden gramaj (kesilen parçanın ölçüsü + tartısı → gr/m²).
import * as z from 'zod/v4';
import { gsmFromSample } from '../../domain/calc/formulas';
import { defineSkill, fmt } from '../types';

const inputSchema = z.object({
  widthMm: z.number().positive().describe('Kesilen numunenin genişliği (mm); 10 cm için 100'),
  lengthMm: z.number().positive().describe('Kesilen numunenin uzunluğu (mm); 10 cm için 100'),
  weightGrams: z.number().positive().describe('Numunenin hassas terazideki ağırlığı (gram)'),
});

export const fabricGsmSample = defineSkill<typeof inputSchema, { gsm: number }>({
  name: 'fabricGsmSample',
  title: 'Numuneden gramaj',
  description:
    'Kumaştan kesilen bir parçanın ölçüsü ve ağırlığından metrekare gramajını (gr/m²) bulur. ' +
    'Kullan: "10x10 cm kestim 2,75 gram geldi, gramajı kaç", "kumaşın gramajını ölçtüm" gibi sorularda. ' +
    'Örgü yapısından tahmin yapmaz (bunun için fabricGsmKnit); en ve metretül hesaplamaz (bunun için fabricLengthWeight).',
  formula: 'Gramaj (gr/m²) = ağırlık(g) / alan(m²); alan = genişlik(mm) × uzunluk(mm) / 1.000.000.',
  inputSchema,
  run: (input) => ({ gsm: gsmFromSample(input.widthMm, input.lengthMm, input.weightGrams) }),
  summarize: (input, out) =>
    `${fmt(input.widthMm, 0)} mm × ${fmt(input.lengthMm, 0)} mm numune ${fmt(input.weightGrams, 4)} g geldi; ` +
    `gramaj ${fmt(out.gsm, 1)} gr/m².`,
});
