// Beceri 8: Konfeksiyon (adet) maliyeti. Kalemler AYRI (Fırat 2026-09-16):
// kumaş, kesim, dikim, yıkama/baskı/boya, aksesuar, paketleme, nakliye,
// genel gider/fire/diğer. Amaç yalnızca toplam değil, hangi aşamanın maliyeti
// yükselttiğini görmek.
import * as z from 'zod/v4';
import { calculateGarmentCost } from '../../domain/calc/formulas';
import { defineSkill, fmt } from '../types';

const money = (desc: string) => z.number().nonnegative().default(0).describe(desc);

const inputSchema = z.object({
  fabricConsumptionMeters: z.number().positive().describe('Bir adet için kumaş tüketimi (metre)'),
  fabricPricePerMeter: z.number().nonnegative().describe('Kumaşın metre fiyatı'),
  wastagePercent: z.number().min(0).max(100).default(0).describe('Kesim firesi (%): pastal yerleşimi, parça araları, kenar; yoksa 0'),
  cuttingCost: money('Adet başına kesim işçiliği'),
  sewingCost: money('Adet başına dikim işçiliği'),
  finishingCost: money('Adet başına yıkama / baskı / boya (terbiye) gideri'),
  accessoryCost: money('Adet başına aksesuar: fermuar, düğme, lastik, etiket, ip, tela, kordon, metal aksesuar'),
  packagingCost: money('Adet başına paketleme'),
  shippingCost: money('Adet başına nakliye'),
  overheadCost: money('Adet başına genel gider / üretim firesi / diğer'),
  quantity: z.number().int().positive().optional().describe('Sipariş adedi; verilirse toplam sipariş maliyeti de döner'),
  currency: z.enum(['TRY', 'USD', 'EUR']).default('TRY').describe('Fiyatların para birimi; hepsi aynı olmalı'),
});

interface GarmentCostOutput {
  fabricCost: number;
  items: { key: string; label: string; amount: number }[];
  totalCost: number;
  orderTotal: number | null;
}

const ITEM_LABELS: [keyof z.infer<typeof inputSchema>, string][] = [
  ['cuttingCost', 'Kesim'],
  ['sewingCost', 'Dikim'],
  ['finishingCost', 'Yıkama / baskı / boya'],
  ['accessoryCost', 'Aksesuar'],
  ['packagingCost', 'Paketleme'],
  ['shippingCost', 'Nakliye'],
  ['overheadCost', 'Genel gider / fire / diğer'],
];

export const garmentCost = defineSkill<typeof inputSchema, GarmentCostOutput>({
  name: 'garmentCost',
  title: 'Konfeksiyon maliyeti',
  description:
    'Bir adet ürünün maliyetini kalem kalem hesaplar: kumaş (tüketim × metre fiyatı × (1 + kesim firesi)), kesim, dikim, yıkama/baskı/boya, aksesuar, paketleme, nakliye, genel gider. ' +
    'Kullan: "bu tişörtün adet maliyeti", "sweatshirt maliyeti çıkar", "baskı eklenirse ne olur" gibi sorularda. Kalemleri ayrı iste, hepsini aksesuara yığma; ' +
    'kullanıcı vermediği kalemi 0 say ve hangilerinin boş kaldığını söyle. Kâr ve vergi eklemez; kumaşın kendi maliyetini bulmaz (bunun için fabricPricing). Kur çevirmez.',
  formula:
    'Kumaş = tüketim(m) × metre fiyatı × (1 + kesim firesi). Adet maliyeti = kumaş + kesim + dikim + yıkama/baskı/boya + aksesuar + paketleme + nakliye + genel gider. ' +
    'Sipariş toplamı = adet maliyeti × adet.',
  inputSchema,
  run: (input) => {
    const { fabricCost } = calculateGarmentCost({
      fabricConsumptionMeters: input.fabricConsumptionMeters,
      fabricPricePerMeter: input.fabricPricePerMeter,
      wastagePercent: input.wastagePercent,
      laborCost: 0,
      accessoryCost: 0,
    });
    const items = ITEM_LABELS.map(([key, label]) => ({ key, label, amount: input[key] as number }));
    const totalCost = fabricCost + items.reduce((s, i) => s + i.amount, 0);
    return { fabricCost, items, totalCost, orderTotal: input.quantity ? totalCost * input.quantity : null };
  },
  summarize: (input, out) => {
    const filled = out.items.filter((i) => i.amount > 0).map((i) => `${i.label.toLowerCase()} ${fmt(i.amount)}`);
    const empty = out.items.filter((i) => i.amount === 0).map((i) => i.label.toLowerCase());
    const parts = [
      `Kumaş ${fmt(out.fabricCost)} ${input.currency} (${fmt(input.fabricConsumptionMeters, 3)} m, kesim firesi %${fmt(input.wastagePercent, 1)} dahil)`,
    ];
    if (filled.length) parts.push(filled.join(', '));
    parts.push(`adet maliyeti ${fmt(out.totalCost)} ${input.currency}`);
    if (out.orderTotal != null) parts.push(`${fmt(input.quantity, 0)} adet için ${fmt(out.orderTotal)} ${input.currency}`);
    if (empty.length) parts.push(`boş kalemler: ${empty.join(', ')}`);
    return parts.join('; ') + '.';
  },
});
