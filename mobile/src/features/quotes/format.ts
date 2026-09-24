// Teklif akışının (Faz 2, Adım 2) ortak biçimlendirmeleri: form ekranı, detay
// ve liste aynı metinleri üretsin diye tek yerde.
import type { Quote, QuoteRequestRow } from '../../api/client';
import { STOCK_UNIT_LABELS, type StockUnit } from '../products/catalog';
import { formatMeasure } from '../calculators/parse';
import { locale } from '../../i18n';

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// "2027-03-01T00:00:00.000Z" → "01.03.2027"
export function formatQuoteDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(locale());
}

// Sunucudan gelen tarihi forma yazmak için: "2027-03-01".
export function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function unitShort(unit: string): string {
  return unit === 'm' || unit === 'kg' ? STOCK_UNIT_LABELS[unit as StockUnit].short : unit;
}

// "1.200 m"
export function formatQuantity(quantity: number, unit: string): string {
  return `${formatMeasure(quantity)} ${unitShort(unit)}`;
}

// "4,50 USD / kg"
export function formatUnitPrice(price: NonNullable<Quote['price']>): string {
  return `${formatMeasure(price.value)} ${price.currency} / ${unitShort(price.unit)}`;
}

// Toplam yalnızca teklifin fiyat birimi ile istenen miktarın birimi AYNIYSA
// hesaplanır: farklı birimde çeviri gramaj/en ister, onu sunucu yapıyor.
export function quoteTotal(quote: Quote, request: QuoteRequestRow): string | null {
  if (!quote.price || quote.price.unit !== request.unit) return null;
  return `${formatMeasure(quote.price.value * request.quantity)} ${quote.price.currency}`;
}

export function isExpired(quote: Quote | null): boolean {
  return !!quote && quote.status === 'expired';
}
