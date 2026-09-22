// Açık talep (ihale) ekranlarının ortak metinleri: liste, detay, akış kartı
// ve form aynı rozet/tarih/birim metnini üretsin diye tek yerde.
import type { FeedTender, Tender, TenderCategory, TenderUnit } from '../../api/client';
import type { BadgeKind } from '../../ui';
import { formatMeasure } from '../calculators/parse';
import { DATE_PATTERN } from '../quotes/format';

export const TENDER_CATEGORIES: { value: TenderCategory; label: string }[] = [
  { value: 'iplik', label: 'İplik' },
  { value: 'kumas', label: 'Kumaş' },
  { value: 'diger', label: 'Diğer' },
];

export const TENDER_UNITS: { value: TenderUnit; label: string }[] = [
  { value: 'kg', label: 'kg' },
  { value: 'ton', label: 'ton' },
  { value: 'm', label: 'metre' },
  { value: 'adet', label: 'adet' },
];

export function tenderUnitShort(unit: string): string {
  return unit === 'm' ? 'm' : unit;
}

// "7.000 kg"
export function formatTenderQuantity(quantity: number, unit: string): string {
  return `${formatMeasure(quantity)} ${tenderUnitShort(unit)}`;
}

// "2026-11-15T20:59:59.000Z" → "15.11.2026"
export function formatTenderDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('tr-TR');
}

// Formdaki "YYYY-AA-GG" → sunucunun istediği ISO zaman. Son teklif tarihi o
// günün sonuna (yerel saatle 23:59), termin gün ortasına yazılır.
export function dateInputToIso(value: string, endOfDay = false): string | null {
  const v = value.trim();
  if (!v || !DATE_PATTERN.test(v)) return null;
  const date = new Date(`${v}T${endOfDay ? '23:59:59' : '12:00:00'}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function isValidDateInput(value: string): boolean {
  const v = value.trim();
  return !v || dateInputToIso(v) !== null;
}

// Liste ve akış kartındaki durum rozeti.
export function tenderBadge(
  tender: Pick<Tender, 'status' | 'offerCount'> & { expired?: boolean }
): { kind: BadgeKind; label: string } {
  if (tender.status === 'awarded') return { kind: 'delivered', label: 'Seçildi' };
  if (tender.status === 'closed' || tender.expired) return { kind: 'cancelled', label: 'Kapandı' };
  if (tender.offerCount > 0) return { kind: 'new', label: `${tender.offerCount} teklif` };
  return { kind: 'pending', label: 'Açık' };
}

// "3 teklif · son teklif: 30.09.2026"
export function tenderMetaLine(tender: Pick<FeedTender, 'offerCount' | 'deadline'>): string {
  const parts = [tender.offerCount > 0 ? `${tender.offerCount} teklif` : 'Henüz teklif yok'];
  if (tender.deadline) parts.push(`son teklif: ${formatTenderDate(tender.deadline)}`);
  return parts.join(' · ');
}
