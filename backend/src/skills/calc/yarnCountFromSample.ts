// Beceri 4: Numuneden iplik numarası (uzunluk + tartı → tex/Ne/Nm/denye).
import * as z from 'zod/v4';
import { yarnCountFromSample as yarnCountFromSampleCalc, type YarnCountResult } from '../../domain/calc/formulas';
import { defineSkill, fmt } from '../types';
import { t } from '../../i18n';

const inputSchema = z.object({
  lengthCm: z.number().positive().describe('Ölçülen iplik parçasının uzunluğu (cm)'),
  weightGrams: z.number().positive().describe('Aynı parçanın hassas terazideki ağırlığı (gram)'),
});

export const yarnCountFromSample = defineSkill<typeof inputSchema, YarnCountResult>({
  name: 'yarnCountFromSample',
  title: 'Numuneden iplik numarası',
  description:
    'Elindeki iplikten belli uzunlukta bir parça kesip tarttığında ipliğin numarasını bulur; sonucu tex, dtex, Nm, Ne ve denye olarak verir. ' +
    'Kullan: "ipliğin numarasını bilmiyorum, ölçtüm", "1 metre iplik 0,05 gram geldi, kaç numara" gibi sorularda. ' +
    'Uzunluk ve ağırlığı kullanıcı ölçer; tahmin etme. Kumaştan sökülen ipliğin kıvrımı ölçümü biraz bozar, sonuç yaklaşıktır.',
  formula: 'tex = ağırlık(g) × 100.000 / uzunluk(cm). Sonra Ne = 1000 / (tex × 1,693), Nm = 1000 / tex, denye = tex × 9.',
  inputSchema,
  run: (input) => yarnCountFromSampleCalc(input.lengthCm, input.weightGrams),
  summarize: (input, out, lang) =>
    t(lang, '{len} cm iplik {g} g geldi; iplik {tex} tex ({ne} Ne, {nm} Nm, {den} denye, {dtex} dtex).', {
      len: fmt(input.lengthCm),
      g: fmt(input.weightGrams, 4),
      tex: fmt(out.tex, 1),
      ne: fmt(out.ne, 1),
      nm: fmt(out.nm, 1),
      den: fmt(out.denye, 0),
      dtex: fmt(out.dtex, 1),
    }),
});
