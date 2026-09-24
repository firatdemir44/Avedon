// Beceri 10: Metre ↔ kilo çevirisi (gramaj ve enden metretül).
// Tüp en (Fırat 2026-09-16): otomatik ikiyle çarpma her zaman doğru değil; enin
// anlamı kullanıcıdan alınır: açık en mi, tek yüz tüp eni mi.
import * as z from 'zod/v4';
import { effectiveWidthCm } from '../../domain/calc/wastage';
import { kgToMeters, metersPerKg, metersToKg } from '../../domain/glossary/units';
import { defineSkill, fmt } from '../types';
import { t } from '../../i18n';

const inputSchema = z.object({
  weightGsm: z.number().positive().describe('Kumaşın gramajı (gr/m²)'),
  widthCm: z.number().positive().describe('Kumaşın eni (cm), kullanıcının söylediği gibi'),
  widthMeaning: z
    .enum(['acik', 'tup_tek_yuz'])
    .default('acik')
    .describe('Enin anlamı: "acik" = açık en (hesapta aynen kullanılır); "tup_tek_yuz" = tek yüz tüp eni (hesapta iki katı alınır). Kumaş tüpse kullanıcıya hangisi olduğunu sor.'),
  meters: z.number().nonnegative().optional().describe('Kumaş metresi; kilo karşılığı isteniyorsa ver'),
  kg: z.number().nonnegative().optional().describe('Kumaş kilosu; metre karşılığı isteniyorsa ver'),
});

interface LengthWeightOutput {
  effectiveWidthCm: number;
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
    'İkisi birden verilirse metre esas alınır. Tüp kumaşta en tek yüz tüp eni ise widthMeaning "tup_tek_yuz" ver (iki katı alınır); açık en ise "acik". Hangisi olduğu belli değilse kullanıcıya sor, kendin karar verme. Fiyat hesaplamaz.',
  formula:
    'Hesap eni = açık en (tek yüz tüp eni verildiyse × 2). 1 metre ağırlığı (g) = gramaj × hesap eni(cm) / 100. metre/kg = 1.000 / metre ağırlığı. kg = metre × metre ağırlığı / 1.000.',
  inputSchema,
  run: (input) => {
    const width = effectiveWidthCm(input.widthCm, input.widthMeaning);
    const perKg = metersPerKg(input.weightGsm, width);
    const kgPerMeter = metersToKg(1, input.weightGsm, width);
    const kg = input.meters != null ? metersToKg(input.meters, input.weightGsm, width) : null;
    const meters = input.meters == null && input.kg != null ? kgToMeters(input.kg, input.weightGsm, width) : null;
    return { effectiveWidthCm: width, metersPerKg: perKg, kgPerMeter, meters, kg };
  },
  summarize: (input, out, lang) => {
    const widthText =
      input.widthMeaning === 'tup_tek_yuz'
        ? t(lang, '{w} cm tek yüz tüp eni (hesapta {eff} cm açık en)', { w: fmt(input.widthCm, 0), eff: fmt(out.effectiveWidthCm, 0) })
        : t(lang, '{w} cm açık en', { w: fmt(input.widthCm, 0) });
    const parts = [
      t(lang, '{gsm} gr/m², {width} ile 1 kg ≈ {mpk} m', { gsm: fmt(input.weightGsm, 0), width: widthText, mpk: fmt(out.metersPerKg) }),
      `1 m ≈ ${fmt(out.kgPerMeter, 3)} kg`,
    ];
    if (out.kg != null) parts.push(`${fmt(input.meters, 1)} m ≈ ${fmt(out.kg, 1)} kg`);
    if (out.meters != null) parts.push(`${fmt(input.kg, 1)} kg ≈ ${fmt(out.meters, 1)} m`);
    return parts.join('; ') + '.';
  },
});
