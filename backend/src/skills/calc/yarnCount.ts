// Beceri 3: İplik numarası çevirisi (Ne, Nm, tex, dtex, denye).
import * as z from 'zod/v4';
import { convertYarnCount, type YarnCountResult, type YarnCountSystem } from '../../domain/calc/formulas';
import { defineSkill, fmt } from '../types';

const system = z.enum(['ne', 'nm', 'tex', 'dtex', 'denye']);

const LABELS: Record<YarnCountSystem, string> = {
  ne: 'Ne',
  nm: 'Nm',
  tex: 'tex',
  dtex: 'dtex',
  denye: 'denye',
};

// Özette gösterim sırası; girdinin kendi sistemi atlanır.
const ORDER: YarnCountSystem[] = ['tex', 'nm', 'ne', 'denye', 'dtex'];

const inputSchema = z.object({
  value: z.number().positive().describe('İplik numarası, örneğin 30/1 Ne için 30'),
  system: system.describe('Numaranın sistemi: ne, nm, tex, dtex, denye'),
  ply: z.number().int().min(1).max(8).default(1).describe('Kat sayısı; 30/1 için 1, 60/2 için 2'),
});

export const yarnCount = defineSkill<typeof inputSchema, YarnCountResult>({
  name: 'yarnCount',
  title: 'İplik numarası çevirisi',
  description:
    'Bir iplik numarasını bütün sistemlere çevirir: Ne, Nm, tex, dtex, denye. Katlı iplikte (60/2 gibi) sonuç, bütün ipliğin kalınlığıdır. ' +
    'Kullan: "30/1 Ne kaç tex", "150 denye kaç Nm eder", "bu iplik kalın mı ince mi" gibi sorularda. ' +
    'Numunenin tartısından numara bulmaz (bunun için yarnCountFromSample), gramaj ya da maliyet hesaplamaz.',
  formula:
    'tex = 1.000 metrenin gram ağırlığı. Ne → tex: 1000 / (Ne × 1,693). Nm → tex: 1000 / Nm. denye = tex × 9, dtex = tex × 10. Katlı iplikte tex × kat sayısı.',
  inputSchema,
  run: (input) => convertYarnCount(input.value, input.system, input.ply),
  summarize: (input, out) => {
    const head = input.ply > 1 ? `${fmt(input.value)}/${input.ply} ${LABELS[input.system]}` : `${fmt(input.value)} ${LABELS[input.system]}`;
    const others = ORDER.filter((s) => s !== input.system).map((s) => `${fmt(out[s], s === 'denye' ? 0 : 1)} ${LABELS[s]}`);
    let text = `${head} ≈ ${others.join(', ')}.`;
    if (input.ply > 1) text += ` Katlı iplik: bu değerler bütün ipliğin kalınlığıdır, ${fmt(out.ne, 1)} Ne kalınlığa denk gelir.`;
    return text;
  },
});
