import { formatMeasure } from '../calculators/parse';
import {
  STOCK_UNIT_LABELS,
  subtypeLabel,
  typeLabel,
  usageLabel,
  type ProductType,
  type StockUnit,
} from './catalog';
import { certificateLabel, fiberLabel, widthTypeLabel, type WidthType } from './glossaryLabels';

// Ürün filtreleri (tasarımdaki "Filtreleme Seçenekleri"). Sunucuda
// GET /api/products sorgu parametrelerine birebir karşılık gelir
// (backend/src/products.ts productQuerySchema).
export interface ProductFilters {
  type?: ProductType;
  subtype?: string;
  // Herhangi birine uyan ürün gelir.
  usages: string[];
  stockUnit?: StockUnit;
  stockMin?: number;
  gsmMin?: number;
  gsmMax?: number;
  widthMin?: number;
  widthMax?: number;
  content?: string;
  // --- Kumaş pasaportu filtreleri (Faz 1) ---
  // Herhangi birini içeren ürün gelir (glossaryLabels.ts FIBERS anahtarları).
  fibers: string[];
  // Yalnızca lif seçiliyken anlamlı: o lif en az bu oranda olsun.
  fiberMinPercent?: number;
  // Herhangi birine sahip ürün gelir (glossaryLabels.ts CERTIFICATES).
  certificates: string[];
  moqMax?: number;
  leadTimeMax?: number;
  widthType?: WidthType;
}

export const EMPTY_FILTERS: ProductFilters = { usages: [], fibers: [], certificates: [] };

export function productQueryString(search: string, filters: ProductFilters) {
  const params: [string, string][] = [];
  const add = (key: string, value: string | number | undefined) => {
    if (value === undefined || value === '') return;
    params.push([key, String(value)]);
  };
  add('search', search.trim());
  add('type', filters.type);
  add('subtype', filters.subtype);
  add('usage', filters.usages.join(','));
  add('stockUnit', filters.stockUnit);
  add('stockMin', filters.stockMin);
  add('gsmMin', filters.gsmMin);
  add('gsmMax', filters.gsmMax);
  add('widthMin', filters.widthMin);
  add('widthMax', filters.widthMax);
  add('content', filters.content?.trim());
  // Pasaport filtreleri (virgülle ayrılmış listeler sunucuda ayrıştırılıyor).
  add('fiber', (filters.fibers ?? []).join(','));
  if ((filters.fibers ?? []).length) add('fiberMinPercent', filters.fiberMinPercent);
  add('certificate', (filters.certificates ?? []).join(','));
  add('moqMax', filters.moqMax);
  add('leadTimeMax', filters.leadTimeMax);
  add('widthType', filters.widthType);
  return params.length ? `?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}` : '';
}

// --- İzleme kuralı süzgeci (Faz 2, Adım 1) -----------------------------------
// Sunucudaki watchQuerySchema (backend/src/watch.ts) ürün sorgusunun izlemeye
// uygun ALT KÜMESİ ve `.strict()`: tanımadığı alan gelirse 400 döner. Bu yüzden
// `stockMin`, `stockUnit`, `content`, `widthType`, `companyId` gibi desteklenmeyen
// alanlar burada bilinçli olarak atılıyor.
export interface FabricWatchQuery {
  search?: string;
  type?: ProductType;
  subtype?: string;
  // Virgülle ayrılmış liste (sunucu ayrıştırıyor).
  usage?: string;
  gsmMin?: number;
  gsmMax?: number;
  widthMin?: number;
  widthMax?: number;
  fiber?: string;
  fiberMinPercent?: number;
  certificate?: string;
  moqMax?: number;
  leadTimeMax?: number;
}

// İplik izleme (Faz 2, Adım 6): sunucudaki yarnWatchQuerySchema de `.strict()`
// ve `kind: 'iplik'` bekliyor. İplik dizinindeki `inStock` izlemeye GİRMEZ
// (stok anlık bir durum, kalıcı bir tarif değil) — kumaştaki stok kuralıyla aynı.
export interface YarnWatchQuery {
  kind: 'iplik';
  search?: string;
  // Virgülle ayrılmış listeler (sunucu ayrıştırıyor).
  family?: string;
  count?: number;
  countMin?: number;
  countMax?: number;
  countUnit?: string;
  ply?: number;
  filaments?: number;
  filamentType?: string;
  spinning?: string;
  combing?: string;
  luster?: string;
  endUse?: string;
  colorState?: string;
  fiber?: string;
  certificate?: string;
  sellerRole?: string;
}

// Kural süzgeci ya kumaş ya iplik tarafındandır; ayrımı `kind` alanı yapar.
export type WatchQuery = FabricWatchQuery | YarnWatchQuery;

export function isYarnWatchQuery(query: WatchQuery): query is YarnWatchQuery {
  return (query as YarnWatchQuery).kind === 'iplik';
}

// Ürünler ekranındaki arama + süzgeç durumundan izleme kuralı süzgeci üretir.
// Hiçbir desteklenen alan dolu değilse null döner (sunucu boş süzgeci reddeder).
export function watchQueryFromFilters(search: string, filters: ProductFilters): FabricWatchQuery | null {
  const query: FabricWatchQuery = {};
  const text = search.trim();
  if (text) query.search = text;
  if (filters.type) query.type = filters.type;
  if (filters.type && filters.subtype) query.subtype = filters.subtype;
  if (filters.usages?.length) query.usage = filters.usages.join(',');
  if (filters.gsmMin !== undefined) query.gsmMin = filters.gsmMin;
  if (filters.gsmMax !== undefined) query.gsmMax = filters.gsmMax;
  if (filters.widthMin !== undefined) query.widthMin = filters.widthMin;
  if (filters.widthMax !== undefined) query.widthMax = filters.widthMax;
  if (filters.fibers?.length) {
    query.fiber = filters.fibers.join(',');
    // Oran tek başına anlamsız: yalnızca lif seçiliyken gider (süzgeç ekranıyla aynı kural).
    if (filters.fiberMinPercent !== undefined) query.fiberMinPercent = filters.fiberMinPercent;
  }
  if (filters.certificates?.length) query.certificate = filters.certificates.join(',');
  if (filters.moqMax !== undefined) query.moqMax = filters.moqMax;
  if (filters.leadTimeMax !== undefined) query.leadTimeMax = filters.leadTimeMax;
  return Object.keys(query).length > 0 ? query : null;
}

// İzlemeye çevrilirken düşen süzgeçler (kullanıcıya söylenir, sessizce yutulmaz).
export function unsupportedWatchFilterLabels(filters: ProductFilters): string[] {
  const dropped: string[] = [];
  if (filters.stockMin !== undefined || filters.stockUnit) dropped.push('stok');
  if (filters.content?.trim()) dropped.push('içerik metni');
  if (filters.widthType) dropped.push('en tipi');
  return dropped;
}

function rangeLabel(min: number | undefined, max: number | undefined, unit: string) {
  if (min !== undefined && max !== undefined) return `${formatMeasure(min)}-${formatMeasure(max)} ${unit}`;
  if (min !== undefined) return `en az ${formatMeasure(min)} ${unit}`;
  return `en çok ${formatMeasure(max!)} ${unit}`;
}

export interface FilterChip {
  key: string;
  label: string;
  // Bu çipi kaldırınca kalan filtreler.
  remove: (filters: ProductFilters) => ProductFilters;
}

// Ürün listesinin üstünde tek tek kaldırılabilen etkin filtreler.
export function activeFilterChips(filters: ProductFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.type) {
    chips.push({
      key: 'type',
      label: typeLabel(filters.type),
      // Çeşit kalkınca ona bağlı alt çeşit de kalkar.
      remove: (f) => ({ ...f, type: undefined, subtype: undefined }),
    });
  }
  if (filters.type && filters.subtype) {
    chips.push({
      key: 'subtype',
      label: subtypeLabel(filters.type, filters.subtype),
      remove: (f) => ({ ...f, subtype: undefined }),
    });
  }
  for (const usage of filters.usages) {
    chips.push({
      key: `usage:${usage}`,
      label: usageLabel(usage),
      remove: (f) => ({ ...f, usages: f.usages.filter((u) => u !== usage) }),
    });
  }
  if (filters.stockMin !== undefined || filters.stockUnit) {
    const unit = STOCK_UNIT_LABELS[filters.stockUnit ?? 'm'].short;
    chips.push({
      key: 'stock',
      label:
        filters.stockMin !== undefined
          ? `Stok en az ${formatMeasure(filters.stockMin)} ${unit}`
          : `Stok birimi: ${unit}`,
      remove: (f) => ({ ...f, stockMin: undefined, stockUnit: undefined }),
    });
  }
  if (filters.gsmMin !== undefined || filters.gsmMax !== undefined) {
    chips.push({
      key: 'gsm',
      label: `Gramaj ${rangeLabel(filters.gsmMin, filters.gsmMax, 'gr/m²')}`,
      remove: (f) => ({ ...f, gsmMin: undefined, gsmMax: undefined }),
    });
  }
  if (filters.widthMin !== undefined || filters.widthMax !== undefined) {
    chips.push({
      key: 'width',
      label: `En ${rangeLabel(filters.widthMin, filters.widthMax, 'cm')}`,
      remove: (f) => ({ ...f, widthMin: undefined, widthMax: undefined }),
    });
  }
  if (filters.content?.trim()) {
    chips.push({
      key: 'content',
      label: `İçerik: ${filters.content.trim()}`,
      remove: (f) => ({ ...f, content: undefined }),
    });
  }
  for (const fiber of filters.fibers ?? []) {
    // Oran yalnızca tek çipte tekrarlanmasın diye ilk life yazılıyor.
    const min = filters.fiberMinPercent;
    chips.push({
      key: `fiber:${fiber}`,
      label: min !== undefined ? `${fiberLabel(fiber)} en az %${formatMeasure(min)}` : fiberLabel(fiber),
      remove: (f) => {
        const rest = f.fibers.filter((v) => v !== fiber);
        return { ...f, fibers: rest, fiberMinPercent: rest.length ? f.fiberMinPercent : undefined };
      },
    });
  }
  for (const certificate of filters.certificates ?? []) {
    chips.push({
      key: `certificate:${certificate}`,
      label: certificateLabel(certificate),
      remove: (f) => ({ ...f, certificates: f.certificates.filter((v) => v !== certificate) }),
    });
  }
  if (filters.moqMax !== undefined) {
    chips.push({
      key: 'moqMax',
      label: `MOQ en çok ${formatMeasure(filters.moqMax)}`,
      remove: (f) => ({ ...f, moqMax: undefined }),
    });
  }
  if (filters.leadTimeMax !== undefined) {
    chips.push({
      key: 'leadTimeMax',
      label: `Termin en çok ${formatMeasure(filters.leadTimeMax)} gün`,
      remove: (f) => ({ ...f, leadTimeMax: undefined }),
    });
  }
  if (filters.widthType) {
    chips.push({
      key: 'widthType',
      label: widthTypeLabel(filters.widthType),
      remove: (f) => ({ ...f, widthType: undefined }),
    });
  }
  return chips;
}

export function countActiveFilters(filters: ProductFilters) {
  return activeFilterChips(filters).length;
}
