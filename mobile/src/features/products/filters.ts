import { formatMeasure } from '../calculators/parse';
import {
  STOCK_UNIT_LABELS,
  subtypeLabel,
  typeLabel,
  usageLabel,
  type ProductType,
  type StockUnit,
} from './catalog';

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
}

export const EMPTY_FILTERS: ProductFilters = { usages: [] };

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
  return params.length ? `?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}` : '';
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
  return chips;
}

export function countActiveFilters(filters: ProductFilters) {
  return activeFilterChips(filters).length;
}
