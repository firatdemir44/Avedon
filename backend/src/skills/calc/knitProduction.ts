// Beceri 2: Örme üretim hesabı (kg/saat, kg/gün, iplik payları, fason geliri).
import * as z from 'zod/v4';
import { calculateKnitProduction, type KnitProductionResult } from '../../domain/calc/formulas';
import { defineSkill, fmt } from '../types';

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
      })
    )
    .min(1)
    .max(8)
    .describe('Makineye beslenen iplikler, satır satır'),
  needles: z.number().int().positive().describe('Makinenin toplam iğne sayısı'),
  rpm: z.number().positive().describe('Makine devri (devir/dakika)'),
  efficiencyPercent: z.number().min(0).max(100).default(100).describe('Randıman (%); bilinmiyorsa kullanıcıya sor'),
  hoursPerDay: z.number().min(0).max(24).default(24).describe('Günlük çalışma saati'),
  knittingFeePerKg: z.number().nonnegative().default(0).describe('Örme fason ücreti (TRY/kg); yoksa 0'),
});

export const knitProduction = defineSkill<typeof inputSchema, KnitProductionResult>({
  name: 'knitProduction',
  title: 'Örme üretim hesabı',
  description:
    'Yuvarlak örme makinesinin saatlik ve günlük kaç kilo kumaş ördüğünü, beslenen ipliklerin kumaştaki ağırlık paylarını ve istenirse günlük fason gelirini hesaplar. ' +
    'Kullan: "bu makine günde kaç kilo örer", "kaç kilo çıkar", "iplik oranları ne olur", "günlük fason kazancım ne kadar" gibi sorularda. ' +
    'İğne sayısı, devir, randıman, çalışma saati ve 50 iğne iplik uzunluğu kullanıcıdan gelir; hiçbirini tahmin etme, eksikse sor. Fiyat ya da kumaş maliyeti hesaplamaz.',
  formula:
    'Bir devirde satırın ördüğü iplik (m) = besleyici × iğne × ilmek boyu(mm) / 1000; gram = metre × tex / 1000. ' +
    'kg/saat = Σ gram × devir × 60 × randıman / 1000. kg/gün = kg/saat × günlük saat. İlmek boyu(mm) = 50 iğne uzunluğu(cm) / 5.',
  inputSchema,
  run: (input) => calculateKnitProduction(input),
  summarize: (input, out) => {
    const shares = out.percents.map((p, i) => `${i + 1}. iplik %${fmt(p, 1)}`).join(', ');
    const parts = [
      `Saatte ${fmt(out.kgPerHour)} kg`,
      `${fmt(input.hoursPerDay)} saatlik günde ${fmt(out.kgPerDay)} kg`,
      `iplik payları: ${shares}`,
    ];
    if (out.dailyFeeIncome != null) parts.push(`günlük fason geliri ${fmt(out.dailyFeeIncome)} TRY`);
    return parts.join('; ') + '.';
  },
});
