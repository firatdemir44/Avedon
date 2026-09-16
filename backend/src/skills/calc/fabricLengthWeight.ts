// Beceri 10: Metre ↔ kilo çevirisi (gramaj ve enden metretül).
import * as z from 'zod/v4';
import { kgToMeters, metersPerKg, metersToKg } from '../../domain/glossary/units';
import { defineSkill, fmt } from '../types';

const inputSchema = z.object({
  weightGsm: z.number().positive().describe('Kumaşın gramajı (gr/m²)'),
  widthCm: z.number().positive().describe('Kumaşın eni (cm)'),
  meters: z.number().nonnegative().optional().describe('Kumaş metresi; kilo karşılığı isteniyorsa ver'),
  kg: z.number().nonnegative().optional().describe('Kumaş kilosu; metre karşılığı isteniyorsa ver'),
});

interface LengthWeightOutput {
  metersPerKg: number;
  kgPerMeter: number;
  meters: number | null;
  kg: number | null;
}

export const fabricLengthWeight = defineSkill<typeof inputSchema, LengthWeightOutput>({
  name: 'fabricLengthWeight',
  title: 'Metre kilo çevirisi',
  description:
    'Gramaj ve enden kumaşın metretülünü verir: 1 kilo kaç metre, 1 metre kaç kilo. Metre verilirse kilosunu, kilo verilirse metresini hesaplar; ikisi de verilmezse yalnızca metre/kg oranını döner. ' +
    'Kullan: "180 gramaj 180 en, 100 kilo kaç metre eder", "bu topun kaç metre olduğunu kilosundan bul", "metre fiyatını kilo fiyatına çevirmem lazım" gibi sorularda. ' +
    'İkisi birden verilirse metre esas alınır. Fiyat hesaplamaz; en tüp ise verilen en değeri kullanıcının söylediği gibi alınır, açık ene çevirmez.',
  formula: '1 metre ağırlığı (g) = gramaj × en(cm) / 100. metre/kg = 1.000 / metre ağırlığı. kg = metre × metre ağırlığı / 1.000.',
  inputSchema,
  run: (input) => {
    const perKg = metersPerKg(input.weightGsm, input.widthCm);
    const kgPerMeter = metersToKg(1, input.weightGsm, input.widthCm);
    const kg = input.meters != null ? metersToKg(input.meters, input.weightGsm, input.widthCm) : null;
    const meters = input.meters == null && input.kg != null ? kgToMeters(input.kg, input.weightGsm, input.widthCm) : null;
    return { metersPerKg: perKg, kgPerMeter, meters, kg };
  },
  summarize: (input, out) => {
    const parts = [
      `${fmt(input.weightGsm, 0)} gr/m², ${fmt(input.widthCm, 0)} cm ende 1 kg ≈ ${fmt(out.metersPerKg)} m`,
      `1 m ≈ ${fmt(out.kgPerMeter, 3)} kg`,
    ];
    if (out.kg != null) parts.push(`${fmt(input.meters, 1)} m ≈ ${fmt(out.kg, 1)} kg`);
    if (out.meters != null) parts.push(`${fmt(input.kg, 1)} kg ≈ ${fmt(out.meters, 1)} m`);
    return parts.join('; ') + '.';
  },
});
