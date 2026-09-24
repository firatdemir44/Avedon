// Beceri 11: Fire zinciriyle ihtiyaç: kaç kg iplik almalı, kaç kg ham örmeli,
// kaç kg mamul üretmeli (Fırat 2026-09-16: örme, boya/apre ve kesim fireleri ayrı).
import * as z from 'zod/v4';
import { requirementChain, type RequirementChain } from '../../domain/calc/wastage';
import { metersToKg } from '../../domain/glossary/units';
import { defineSkill, fmt } from '../types';
import { t } from '../../i18n';

const inputSchema = z
  .object({
    finishedKg: z.number().positive().optional().describe('Gereken mamul (boyalı/apreli) kumaş, kg. Metre biliniyorsa bunun yerine finishedMeters + weightGsm + widthCm ver.'),
    finishedMeters: z.number().positive().optional().describe('Gereken mamul kumaş, metre (gramaj ve en ile birlikte)'),
    weightGsm: z.number().positive().optional().describe('Mamul gramaj (gr/m²); finishedMeters verildiyse gerekli'),
    widthCm: z.number().positive().optional().describe('Hesapta kullanılacak açık en (cm); finishedMeters verildiyse gerekli'),
    garmentFabricKg: z.number().positive().optional().describe('Dikilmiş ürüne giren kumaş (kg); verilirse kesim firesiyle mamul ihtiyacı bundan türetilir'),
    cuttingLossPercent: z.number().min(0).max(99.9).default(0).describe('Kesim firesi (%): pastal, parça araları, kenar; garmentFabricKg ile kullanılır'),
    dyeingLossPercent: z.number().min(0).max(99.9).describe('Boya / apre firesi (%): ham kumaştan mamule kayıp'),
    knittingLossPercent: z.number().min(0).max(99.9).describe('Örme firesi (%): iplikten ham kumaşa kayıp'),
  })
  .refine((v) => v.finishedKg != null || v.garmentFabricKg != null || (v.finishedMeters != null && v.weightGsm != null && v.widthCm != null), {
    message: 'finishedKg ya da garmentFabricKg ya da finishedMeters + weightGsm + widthCm verilmeli',
    path: ['finishedKg'],
  });

export const yarnRequirement = defineSkill<typeof inputSchema, RequirementChain>({
  name: 'yarnRequirement',
  title: 'İplik ve kumaş ihtiyacı (fire zinciri)',
  description:
    'Bir sipariş için kaç kg iplik alınmalı, kaç kg ham kumaş örülmeli ve kaç kg mamul kumaş üretilmeli sorusunu fire zinciriyle cevaplar: ' +
    'dikilmiş ürün → kesim firesi → mamul kumaş → boya/apre firesi → ham kumaş → örme firesi → iplik. Fireler ayrı ayrı girilir, tek fire ile karıştırılmaz. ' +
    'Kullan: "bu sipariş için kaç kilo iplik almalıyım", "kaç kilo ham örmem lazım", "fireleri hesaba kat" gibi sorularda. ' +
    'Fire oranları firma hafızasında varsa onları kullan ve söyle; yoksa sor. Fiyat hesaplamaz.',
  formula:
    'Mamul = dikilmiş ürün kumaşı / (1 − kesim firesi). Ham = mamul / (1 − boya/apre firesi). İplik = ham / (1 − örme firesi). ' +
    'Metre verildiyse mamul kg = metre × gramaj × en / 100.000.',
  inputSchema,
  run: (input) => {
    const finishedKg =
      input.finishedKg ??
      (input.finishedMeters != null && input.weightGsm != null && input.widthCm != null
        ? metersToKg(input.finishedMeters, input.weightGsm, input.widthCm)
        : undefined);
    return requirementChain({
      finishedKg,
      garmentFabricKg: input.garmentFabricKg,
      cuttingLossPercent: input.cuttingLossPercent,
      dyeingLossPercent: input.dyeingLossPercent,
      knittingLossPercent: input.knittingLossPercent,
    });
  },
  summarize: (input, out, lang) => {
    const parts: string[] = [];
    if (out.garmentFabricKg != null) {
      parts.push(
        t(lang, '{g} kg dikilmiş ürün kumaşı için kesim firesi %{c} ile {f} kg mamul kumaş', {
          g: fmt(out.garmentFabricKg),
          c: fmt(input.cuttingLossPercent, 1),
          f: fmt(out.finishedKg),
        })
      );
    } else {
      parts.push(t(lang, '{f} kg mamul kumaş', { f: fmt(out.finishedKg) }));
    }
    parts.push(t(lang, 'boya/apre firesi %{p} ile {v} kg ham kumaş örülmeli', { p: fmt(input.dyeingLossPercent, 1), v: fmt(out.greigeKg) }));
    parts.push(t(lang, 'örme firesi %{p} ile {v} kg iplik alınmalı', { p: fmt(input.knittingLossPercent, 1), v: fmt(out.yarnKg) }));
    return parts.join('; ') + '.';
  },
});
