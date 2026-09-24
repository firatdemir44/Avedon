import { locale, tr } from '../../i18n';
// Konfeksiyon (adet) maliyetinin AYRI kalemleri — Fırat'ın kararı (2026-09-16,
// docs/faz1-plani.md Adım 4, madde 3): amaç yalnızca toplamı görmek değil,
// hangi aşamanın maliyeti yükselttiğini görmek.
//
// Kalem adları ve sırası sunucudaki beceriyle (backend/src/skills/calc/garmentCost.ts)
// aynı tutulur ki asistan kartı ile hesaplayıcı ekranı aynı dili konuşsun.
// DİKKAT: bu dosya `formulas.ts`'in kopya ikizi DEĞİLDİR; kumaş maliyeti hâlâ
// `calculateGarmentCost` ile hesaplanır, burada yalnızca kalemler toplanır.

export type GarmentItemKey =
  | 'cutting'
  | 'sewing'
  | 'finishing'
  | 'accessory'
  | 'packaging'
  | 'shipping'
  | 'overhead';

export interface GarmentItemDef {
  key: GarmentItemKey;
  label: string;
  /** Alanın altındaki küçük açıklama (neyin içine girdiği). */
  hint?: string;
  placeholder: string;
}

export const GARMENT_ITEMS: GarmentItemDef[] = [
  { key: 'cutting', get label() { return tr('Kesim'); }, get placeholder() { return tr('Örn. {n}', { n: 15 }); } },
  { key: 'sewing', get label() { return tr('Dikim'); }, get placeholder() { return tr('Örn. {n}', { n: 65 }); } },
  { key: 'finishing', get label() { return tr('Yıkama / baskı / boya'); }, get placeholder() { return tr('Örn. {n}', { n: 25 }); } },
  {
    key: 'accessory',
    get label() { return tr('Aksesuar'); },
    get hint() { return tr('Fermuar, düğme, lastik, etiket, ip, tela, kordon'); },
    get placeholder() { return tr('Örn. {n}', { n: 12 }); },
  },
  { key: 'packaging', get label() { return tr('Paketleme'); }, get placeholder() { return tr('Örn. {n}', { n: 8 }); } },
  { key: 'shipping', get label() { return tr('Nakliye'); }, get placeholder() { return tr('Örn. {n}', { n: 10 }); } },
  { key: 'overhead', get label() { return tr('Genel gider / fire / diğer'); }, get placeholder() { return tr('Örn. {n}', { n: 10 }); } },
];

// Dil değişince güncel kalsın diye fonksiyon.
export function fabricLabel(): string {
  return tr('Kumaş');
}

export type GarmentItemAmounts = Record<GarmentItemKey, number>;

export interface GarmentBreakdownRow {
  key: GarmentItemKey | 'fabric';
  label: string;
  amount: number;
  /** Toplam içindeki payı (%). Toplam 0 ise 0. */
  sharePercent: number;
  /** Tutarı en yüksek kalem (vurgulanır). Toplam 0 ise hiçbiri. */
  largest: boolean;
}

export interface GarmentBreakdown {
  /** Kumaş dahil, tutarı 0'dan büyük olan kalemler (girildiği sırada). */
  rows: GarmentBreakdownRow[];
  /** Boş bırakılan (0) kalemlerin adları; kumaş buraya girmez. */
  emptyLabels: string[];
  itemsTotal: number;
  totalCost: number;
  orderTotal: number | null;
}

/**
 * Kumaş maliyeti (calculateGarmentCost'tan) + adet başı kalemleri birleştirir.
 * Adet maliyeti = kumaş + kalemler; sipariş adedi verilirse sipariş toplamı.
 */
export function buildGarmentBreakdown(
  fabricCost: number,
  amounts: GarmentItemAmounts,
  quantity?: number
): GarmentBreakdown {
  const itemsTotal = GARMENT_ITEMS.reduce((sum, item) => sum + (amounts[item.key] || 0), 0);
  const totalCost = fabricCost + itemsTotal;

  const all: { key: GarmentItemKey | 'fabric'; label: string; amount: number }[] = [
    { key: 'fabric', label: fabricLabel(), amount: fabricCost },
    ...GARMENT_ITEMS.map((item) => ({ key: item.key, label: item.label, amount: amounts[item.key] || 0 })),
  ];

  const maxAmount = all.reduce((max, row) => Math.max(max, row.amount), 0);
  let largestMarked = false;

  const rows: GarmentBreakdownRow[] = all
    .filter((row) => row.amount > 0)
    .map((row) => {
      // Birden çok kalem aynı en yüksek tutardaysa yalnızca ilki vurgulanır.
      const largest = !largestMarked && maxAmount > 0 && row.amount === maxAmount;
      if (largest) largestMarked = true;
      return {
        ...row,
        sharePercent: totalCost > 0 ? (row.amount / totalCost) * 100 : 0,
        largest,
      };
    });

  const emptyLabels = GARMENT_ITEMS.filter((item) => !(amounts[item.key] > 0)).map((item) =>
    item.label.toLocaleLowerCase(locale())
  );

  return {
    rows,
    emptyLabels,
    itemsTotal,
    totalCost,
    orderTotal: quantity && quantity > 0 ? totalCost * quantity : null,
  };
}
