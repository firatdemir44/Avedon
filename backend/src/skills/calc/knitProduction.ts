// Beceri 2: Örme üretim hesabı (kg/saat, kg/gün, iplik payları, fason geliri).
// Randıman, günlük saat ve makine adedi firma hafızasından gelir (Fırat
// 2026-09-16: her seferinde sorulmaz; önerilen başlangıç %85, 20 saat, 1 makine).
import * as z from 'zod/v4';
import { calculateKnitProduction, type KnitProductionResult } from '../../domain/calc/formulas';
import { defineSkill, fmt } from '../types';
import { t } from '../../i18n';

const system = z.enum(['ne', 'nm', 'tex', 'dtex', 'denye']);

const inputSchema = z.object({
  rows: z
    .array(
      z.object({
        lengthPer50NeedlesCm: z
          .number()
          .positive()
          .describe('50 iğnede ölçülen iplik uzunluğu (cm); makinenin ilmek ayarından okunur'),
        count: z.number().positive().describe('İpliğin numarası'),
        system: system.describe('Numara sistemi: ne, nm, tex, dtex, denye'),
        feeders: z.number().int().positive().describe('Bu ipliğin beslendiği sistem (besleyici) sayısı'),
        label: z.string().max(40).optional().describe('İpliğin adı, ör. "ana iplik", "elastan"; özet için'),
      })
    )
    .min(1)
    .max(8)
    .describe('Makineye beslenen iplikler, satır satır'),
  needles: z.number().int().positive().describe('Makinenin toplam iğne sayısı'),
  rpm: z.number().positive().describe('Makine devri (devir/dakika)'),
  efficiencyPercent: z.number().min(0).max(100).describe('Randıman (%); firma hafızasındaki efficiencyPercent değerini kullan, yoksa sor'),
  hoursPerDay: z.number().min(0).max(24).describe('Günlük çalışma saati (molalar düşülmüş); firma hafızasındaki hoursPerDay değerini kullan, yoksa sor'),
  machineCount: z.number().int().min(1).max(500).default(1).describe('Aynı ayarda çalışan makine adedi; firma hafızasındaki machineCount, yoksa 1'),
  knittingFeePerKg: z.number().nonnegative().default(0).describe('Örme fason ücreti (TRY/kg); yoksa 0'),
});

type KnitProductionOutput = KnitProductionResult & { machineCount: number; perMachineKgPerDay: number };

export const knitProduction = defineSkill<typeof inputSchema, KnitProductionOutput>({
  name: 'knitProduction',
  title: 'Örme üretim hesabı',
  description:
    'Yuvarlak örme makinesinin saatlik ve günlük kaç kilo kumaş ördüğünü, beslenen ipliklerin kumaştaki ağırlık paylarını ve istenirse günlük fason gelirini hesaplar; makine adedi verilirse toplamı. ' +
    'Kullan: "bu makine günde kaç kilo örer", "kaç kilo çıkar", "iplik oranları ne olur", "günlük fason kazancım ne kadar" gibi sorularda. ' +
    'İğne sayısı, devir ve 50 iğne iplik uzunluğu kullanıcıdan gelir. Randıman, günlük saat ve makine adedini firma hafızasından al ve kullandığını söyle; hafızada yoksa sor (önerilen başlangıç: %85, 20 saat, 1 makine; sektör standardı değil). Fiyat ya da kumaş maliyeti hesaplamaz.',
  formula:
    'Bir devirde satırın ördüğü iplik (m) = besleyici × iğne × ilmek boyu(mm) / 1000; gram = metre × tex / 1000. ' +
    'kg/saat = Σ gram × devir × 60 × randıman / 1000. kg/gün = kg/saat × günlük saat × makine adedi. İlmek boyu(mm) = 50 iğne uzunluğu(cm) / 5.',
  inputSchema,
  run: (input) => {
    const one = calculateKnitProduction(input);
    const n = input.machineCount;
    return {
      kgPerHour: one.kgPerHour * n,
      kgPerDay: one.kgPerDay * n,
      percents: one.percents,
      dailyFeeIncome: one.dailyFeeIncome != null ? one.dailyFeeIncome * n : null,
      machineCount: n,
      perMachineKgPerDay: one.kgPerDay,
    };
  },
  summarize: (input, out, lang) => {
    const shares = out.percents
      .map((p, i) => `${input.rows[i]?.label ?? t(lang, '{n}. iplik', { n: i + 1 })} %${fmt(p, 1)}`)
      .join(', ');
    const parts = [
      t(lang, 'Saatte {v} kg', { v: fmt(out.kgPerHour) }),
      t(lang, '{h} saatlik günde, randıman %{eff} ile {v} kg', {
        h: fmt(input.hoursPerDay),
        eff: fmt(input.efficiencyPercent, 0),
        v: fmt(out.kgPerDay),
      }),
    ];
    if (out.machineCount > 1) {
      parts.push(t(lang, '({n} makine, makine başına {v} kg/gün)', { n: out.machineCount, v: fmt(out.perMachineKgPerDay) }));
    }
    parts.push(t(lang, 'iplik payları: {list}', { list: shares }));
    if (out.dailyFeeIncome != null) parts.push(t(lang, 'günlük fason geliri {v} TRY', { v: fmt(out.dailyFeeIncome) }));
    return parts.join('; ') + '.';
  },
});
