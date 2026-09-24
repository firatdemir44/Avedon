// Beceri 7: Örgü yapısından teorik HAM gramaj; isteğe bağlı mamul gramaj
// tahmini. Fırat (2026-09-16): sabit "%5 sapar" kuralı yok; üç düzey vardır:
// A teorik ham gramaj, B terbiye sonrası tahmin (kullanıcının kendi geçmişinden
// yüzde ya da ham/mamul en değişimi), C gerçek ölçülen mamul gramaj.
import * as z from 'zod/v4';
import { gsmFromKnitStructure, loopLengthMmFrom50Needles, toTex } from '../../domain/calc/formulas';
import { gsmAfterWidthChange, gsmWithChangePercent } from '../../domain/calc/wastage';
import { defineSkill, fmt } from '../types';
import { t } from '../../i18n';

const system = z.enum(['ne', 'nm', 'tex', 'dtex', 'denye']);

const inputSchema = z
  .object({
    coursesPerCm: z.number().positive().describe('Santimetredeki sıra sayısı (sıra/cm)'),
    walesPerCm: z.number().positive().describe('Santimetredeki çubuk sayısı (çubuk/cm)'),
    loopLengthMm: z.number().positive().optional().describe('Tek ilmek boyu (mm); biliniyorsa bunu ver'),
    lengthPer50NeedlesCm: z
      .number()
      .positive()
      .optional()
      .describe('50 iğnede ölçülen iplik uzunluğu (cm); ilmek boyu bilinmiyorsa bunu ver'),
    yarnTex: z.number().positive().optional().describe('İplik numarası tex olarak; biliniyorsa bunu ver'),
    yarnCount: z.number().positive().optional().describe('İplik numarası (tex değilse); sistemiyle birlikte ver'),
    yarnSystem: system.optional().describe('yarnCount hangi sistemde: ne, nm, tex, dtex, denye'),
    doubleJersey: z
      .boolean()
      .default(false)
      .describe('Çift plaka örgü mü (ribana, interlok, kaşkorse gibi): evet ise true, süprem gibi tek plakada false'),
    greigeWidthCm: z.number().positive().optional().describe('Ham en (cm); mamul enle birlikte verilirse en değişiminden mamul gramaj tahmini yapılır'),
    finishedWidthCm: z.number().positive().optional().describe('Mamul (terbiye sonrası) en (cm)'),
    finishChangePercent: z
      .number()
      .min(-90)
      .max(300)
      .optional()
      .describe('Kullanıcının kendi geçmişinden terbiye sonrası gramaj değişimi (%, artış pozitif); en verilmediyse alternatif tahmin'),
    measuredFinishedGsm: z.number().positive().optional().describe('Üretim sonrası gerçek ölçülen mamul gramaj; verilirse tahminle sapma hesaplanır'),
  })
  .refine((v) => v.loopLengthMm != null || v.lengthPer50NeedlesCm != null, {
    message: 'İlmek boyu (loopLengthMm) ya da 50 iğne iplik uzunluğu (lengthPer50NeedlesCm) verilmeli',
    path: ['loopLengthMm'],
  })
  .refine((v) => v.yarnTex != null || (v.yarnCount != null && v.yarnSystem != null), {
    message: 'İplik için ya yarnTex ya da yarnCount + yarnSystem verilmeli',
    path: ['yarnTex'],
  });

interface KnitGsmOutput {
  gsm: number; // A: teorik ham gramaj
  loopLengthMm: number;
  yarnTex: number;
  estimatedFinishedGsm: number | null; // B: tahmini mamul gramaj
  estimateBasis: 'width_change' | 'change_percent' | null;
  measuredFinishedGsm: number | null; // C
  deviationPercent: number | null; // (C - B) / B
}

export const fabricGsmKnit = defineSkill<typeof inputSchema, KnitGsmOutput>({
  name: 'fabricGsmKnit',
  title: 'Örgüden tahmini gramaj',
  description:
    'Örgü yapısından kumaşın teorik HAM gramajını (gr/m²) hesaplar: sıra ve çubuk sayısı, ilmek boyu ve iplik numarasıyla. ' +
    'İlmek boyunu ya doğrudan (mm) ya da 50 iğne iplik uzunluğundan (cm); ipliği ya tex ya da numara + sistem olarak ver. ' +
    'Mamul gramaj için sabit bir sapma yüzdesi YOKTUR: ham ve mamul en verilirse en değişiminden (metre ağırlığı sabit), ya da kullanıcının kendi geçmişinden verdiği yüzdeyle tahmin eder; gerçek ölçüm verilirse sapmayı gösterir. ' +
    'Kullan: "bu ayarla kaç gramaj çıkar", "ilmek boyunu değiştirsem gramaj ne olur", "en 160\'a inerse gramaj ne olur" gibi sorularda. Kesin gramaj için numune tartılır (fabricGsmSample).',
  formula:
    'İlmek/cm² = sıra/cm × çubuk/cm (çift plakada × 2). Ham gramaj = ilmek/cm² × ilmek boyu(mm) × tex / 100. İlmek boyu(mm) = 50 iğne uzunluğu(cm) / 5. ' +
    'Mamul gramaj (en değişimi) = ham gramaj × ham en / mamul en. Sapma = (gerçek − tahmin) / tahmin.',
  inputSchema,
  run: (input) => {
    const loopLengthMm = input.loopLengthMm ?? loopLengthMmFrom50Needles(input.lengthPer50NeedlesCm as number);
    const yarnTex = input.yarnTex ?? toTex(input.yarnCount as number, input.yarnSystem!);
    const gsm = gsmFromKnitStructure({
      coursesPerCm: input.coursesPerCm,
      walesPerCm: input.walesPerCm,
      loopLengthMm,
      yarnTex,
      doubleJersey: input.doubleJersey,
    });
    let estimatedFinishedGsm: number | null = null;
    let estimateBasis: KnitGsmOutput['estimateBasis'] = null;
    if (input.greigeWidthCm != null && input.finishedWidthCm != null) {
      estimatedFinishedGsm = gsmAfterWidthChange(gsm, input.greigeWidthCm, input.finishedWidthCm);
      estimateBasis = 'width_change';
    } else if (input.finishChangePercent != null) {
      estimatedFinishedGsm = gsmWithChangePercent(gsm, input.finishChangePercent);
      estimateBasis = 'change_percent';
    }
    const measuredFinishedGsm = input.measuredFinishedGsm ?? null;
    const deviationPercent =
      measuredFinishedGsm != null && estimatedFinishedGsm != null ? ((measuredFinishedGsm - estimatedFinishedGsm) / estimatedFinishedGsm) * 100 : null;
    return { gsm, loopLengthMm, yarnTex, estimatedFinishedGsm, estimateBasis, measuredFinishedGsm, deviationPercent };
  },
  summarize: (input, out, lang) => {
    const parts = [
      t(lang, '{courses} sıra/cm, {wales} çubuk/cm, ilmek boyu {loop} mm, iplik {tex} tex{plate}', {
        courses: fmt(input.coursesPerCm, 1),
        wales: fmt(input.walesPerCm, 1),
        loop: fmt(out.loopLengthMm, 2),
        tex: fmt(out.yarnTex, 1),
        plate: input.doubleJersey ? t(lang, ' (çift plaka)') : t(lang, ' (tek plaka)'),
      }),
      t(lang, 'teorik ham gramaj {gsm} gr/m²', { gsm: fmt(out.gsm, 1) }),
    ];
    if (out.estimatedFinishedGsm != null) {
      parts.push(
        out.estimateBasis === 'width_change'
          ? t(lang, 'en {from} → {to} cm ile tahmini mamul gramaj {gsm} gr/m²', {
              from: fmt(input.greigeWidthCm, 0),
              to: fmt(input.finishedWidthCm, 0),
              gsm: fmt(out.estimatedFinishedGsm, 1),
            })
          : t(lang, '%{pct} değişimle tahmini mamul gramaj {gsm} gr/m²', {
              pct: fmt(input.finishChangePercent, 1),
              gsm: fmt(out.estimatedFinishedGsm, 1),
            })
      );
    }
    if (out.deviationPercent != null) {
      parts.push(t(lang, 'gerçek ölçüm {gsm} gr/m², sapma %{dev}', { gsm: fmt(out.measuredFinishedGsm, 1), dev: fmt(out.deviationPercent, 1) }));
    }
    return parts.join('; ') + '.';
  },
});
