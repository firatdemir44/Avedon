// Beceri 7: Örgü yapısından tahmini gramaj (sıra/çubuk/ilmek boyu/iplik).
import * as z from 'zod/v4';
import { gsmFromKnitStructure, loopLengthMmFrom50Needles, toTex } from '../../domain/calc/formulas';
import { defineSkill, fmt } from '../types';

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
  gsm: number;
  loopLengthMm: number;
  yarnTex: number;
}

export const fabricGsmKnit = defineSkill<typeof inputSchema, KnitGsmOutput>({
  name: 'fabricGsmKnit',
  title: 'Örgüden tahmini gramaj',
  description:
    'Örgü yapısından kumaşın tahmini gramajını (gr/m²) hesaplar: santimetredeki sıra ve çubuk sayısı, ilmek boyu ve iplik numarasıyla. ' +
    'İlmek boyunu ya doğrudan (mm) ya da 50 iğnede ölçülen iplik uzunluğundan (cm) verebilirsin; ipliği ya tex olarak ya da numara + sistem olarak. ' +
    'Kullan: "bu ayarla kaç gramaj çıkar", "ilmek boyunu değiştirsem gramaj ne olur" gibi sorularda. ' +
    'Sonuç tahmindir: boya, apre ve çekme payı hesaba girmez; kesin gramaj için numune tartılır (fabricGsmSample).',
  formula:
    'İlmek/cm² = sıra/cm × çubuk/cm (çift plakada × 2). Gramaj = ilmek/cm² × ilmek boyu(mm) × tex / 100. ' +
    'İlmek boyu(mm) = 50 iğne uzunluğu(cm) / 5.',
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
    return { gsm, loopLengthMm, yarnTex };
  },
  summarize: (input, out) =>
    `${fmt(input.coursesPerCm, 1)} sıra/cm, ${fmt(input.walesPerCm, 1)} çubuk/cm, ilmek boyu ${fmt(out.loopLengthMm, 2)} mm, ` +
    `iplik ${fmt(out.yarnTex, 1)} tex${input.doubleJersey ? ' (çift plaka)' : ' (tek plaka)'}; ` +
    `tahmini gramaj ${fmt(out.gsm, 1)} gr/m².`,
});
