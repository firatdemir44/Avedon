// Beceri 4: Numuneden iplik numarası (uzunluk + tartı → tex/Ne/Nm/denye).
import * as z from 'zod/v4';
import { yarnCountFromSample as yarnCountFromSampleCalc, type YarnCountResult } from '../../domain/calc/formulas';
import { defineSkill, fmt } from '../types';

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
  summarize: (input, out) =>
    `${fmt(input.lengthCm)} cm iplik ${fmt(input.weightGrams, 4)} g geldi; iplik ${fmt(out.tex, 1)} tex ` +
    `(${fmt(out.ne, 1)} Ne, ${fmt(out.nm, 1)} Nm, ${fmt(out.denye, 0)} denye, ${fmt(out.dtex, 1)} dtex).`,
});
