// Beceri 5: İplik oranları (satır satır beslemeden kumaştaki ağırlık payları).
import * as z from 'zod/v4';
import { yarnUsageRatios, type YarnCountSystem } from '../../domain/calc/formulas';
import { defineSkill, fmt } from '../types';
import { t } from '../../i18n';

const system = z.enum(['ne', 'nm', 'tex', 'dtex', 'denye']);

const LABELS: Record<YarnCountSystem, string> = { ne: 'Ne', nm: 'Nm', tex: 'tex', dtex: 'dtex', denye: 'denye' };

const inputSchema = z.object({
  rows: z
    .array(
      z.object({
        lengthPer50NeedlesCm: z.number().positive().describe('50 iğnede ölçülen iplik uzunluğu (cm)'),
        count: z.number().positive().describe('İpliğin numarası'),
        system: system.describe('Numara sistemi: ne, nm, tex, dtex, denye'),
        feeders: z.number().int().positive().describe('Bu ipliğin beslendiği sistem (besleyici) sayısı'),
      })
    )
    .min(1)
    .max(8)
    .describe('Makineye beslenen iplikler, satır satır'),
});

export const yarnUsageRatio = defineSkill<typeof inputSchema, { percents: number[] }>({
  name: 'yarnUsageRatio',
  title: 'İplik oranları',
  description:
    'Makineye beslenen ipliklerin kumaştaki ağırlık paylarını yüzde olarak verir; kompozisyon yazarken ve maliyette iplik oranı olarak kullanılır. ' +
    'Kullan: "bu besleme ile kaç yüzde elastan çıkar", "iplik oranları ne olur", "kompozisyonu hesapla" gibi sorularda. ' +
    'Lif adı bilmez, yalnızca satırların payını verir; üretim miktarı hesaplamaz (bunun için knitProduction).',
  formula:
    'Satır ağırlığı ∝ besleyici × ilmek boyu(mm) × tex. Pay (%) = satır ağırlığı / toplam × 100. İğne sayısı bütün satırlarda aynı olduğu için orana etki etmez.',
  inputSchema,
  run: (input) => ({ percents: yarnUsageRatios(input.rows) }),
  summarize: (input, out, lang) =>
    out.percents
      .map((p, i) =>
        t(lang, '{count} {sys} iplik %{pct}', { count: fmt(input.rows[i].count), sys: t(lang, LABELS[input.rows[i].system]), pct: fmt(p, 1) })
      )
      .join(', ') + '.',
});
