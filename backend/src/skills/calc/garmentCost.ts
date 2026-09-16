// Beceri 8: Konfeksiyon (adet) maliyeti: kumaş + fire + işçilik + aksesuar.
import * as z from 'zod/v4';
import { calculateGarmentCost, type GarmentCostResult } from '../../domain/calc/formulas';
import { defineSkill, fmt } from '../types';

const inputSchema = z.object({
  fabricConsumptionMeters: z.number().positive().describe('Bir adet için kumaş tüketimi (metre)'),
  fabricPricePerMeter: z.number().nonnegative().describe('Kumaşın metre fiyatı'),
  wastagePercent: z.number().min(0).max(100).default(0).describe('Kesim firesi (%); yoksa 0'),
  laborCost: z.number().nonnegative().default(0).describe('Adet başına dikim/işçilik ücreti'),
  accessoryCost: z.number().nonnegative().default(0).describe('Adet başına aksesuar gideri (etiket, düğme, fermuar ...)'),
  currency: z.enum(['TRY', 'USD', 'EUR']).default('TRY').describe('Fiyatların para birimi; hepsi aynı olmalı'),
});

export const garmentCost = defineSkill<typeof inputSchema, GarmentCostResult>({
  name: 'garmentCost',
  title: 'Konfeksiyon maliyeti',
  description:
    'Bir adet ürünün maliyetini hesaplar: kumaş tüketimi × metre fiyatı × (1 + kesim firesi), üstüne işçilik ve aksesuar. ' +
    'Kullan: "bu tişörtün maliyeti ne olur", "adet maliyeti hesapla", "fire %10 olsa kaça mal olur" gibi sorularda. ' +
    'Kâr, nakliye ve vergi eklemez; kumaşın kendi maliyetini bulmaz (bunun için fabricPricing). Bütün kalemler aynı para biriminde olmalı, kur çevirmez.',
  formula: 'Kumaş maliyeti = tüketim(m) × metre fiyatı × (1 + kesim firesi). Toplam = kumaş maliyeti + işçilik + aksesuar.',
  inputSchema,
  run: (input) => calculateGarmentCost(input),
  summarize: (input, out) =>
    `${fmt(input.fabricConsumptionMeters, 3)} m kumaş için ${fmt(out.fabricCost)} ${input.currency} ` +
    `(kesim firesi %${fmt(input.wastagePercent, 1)} dahil); işçilik ${fmt(input.laborCost)} ve aksesuar ${fmt(input.accessoryCost)} ile ` +
    `adet maliyeti ${fmt(out.totalCost)} ${input.currency}.`,
});
