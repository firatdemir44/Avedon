// Açık talep (ihale) ekranlarının ortak metinleri: liste, detay, akış kartı
// ve form aynı rozet/tarih/birim metnini üretsin diye tek yerde.
import type { AccessoryType, FeedTender, GarmentDelivery, GarmentType, Tender, TenderCategory, TenderUnit } from '../../api/client';
import type { BadgeKind } from '../../ui';
import { formatMeasure } from '../calculators/parse';
import { DATE_PATTERN } from '../quotes/format';

export const TENDER_CATEGORIES: { value: TenderCategory; label: string }[] = [
  { value: 'iplik', label: 'İplik' },
  { value: 'kumas', label: 'Kumaş' },
  { value: 'konfeksiyon', label: 'Konfeksiyon' },
  { value: 'aksesuar', label: 'Aksesuar' },
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

// --- Konfeksiyon (fason) talebi ---------------------------------------------

export const GARMENT_TYPES: { value: GarmentType; label: string }[] = [
  { value: 'tisort', label: 'Tişört' },
  { value: 'sweatshirt', label: 'Sweatshirt' },
  { value: 'gomlek', label: 'Gömlek' },
  { value: 'pantolon', label: 'Pantolon' },
  { value: 'etek', label: 'Etek' },
  { value: 'elbise', label: 'Elbise' },
  { value: 'mont', label: 'Mont' },
  { value: 'ceket', label: 'Ceket' },
  { value: 'esofman', label: 'Eşofman' },
  { value: 'ic_giyim', label: 'İç giyim' },
  { value: 'bebek_cocuk', label: 'Bebek / çocuk' },
  { value: 'diger', label: 'Diğer' },
];

export const GARMENT_DELIVERY: { value: GarmentDelivery; label: string }[] = [
  { value: 'kesim', label: 'Kesim' },
  { value: 'dikim', label: 'Dikim' },
  { value: 'utu', label: 'Ütü' },
  { value: 'etiket', label: 'Etiket' },
  { value: 'paket', label: 'Paket' },
  { value: 'poset', label: 'Poşet' },
  { value: 'koli', label: 'Koli' },
  { value: 'tam_teslim', label: 'Tam teslim' },
];

export const FABRIC_SUPPLIERS: { value: 'alici' | 'uretici'; label: string }[] = [
  { value: 'alici', label: 'Alıcı' },
  { value: 'uretici', label: 'Üretici' },
];

export function garmentTypeLabel(value: string | undefined): string {
  return GARMENT_TYPES.find((g) => g.value === value)?.label ?? '';
}

export function garmentDeliveryLabel(value: string): string {
  return GARMENT_DELIVERY.find((d) => d.value === value)?.label ?? value;
}

// Fotoğraf açıklaması için hazır seçenekler (sunucu ≤40 karakter).
export const MEDIA_CAPTIONS = ['Yakın', 'Orta', 'Uzak', 'Etiket', 'Ön', 'Arka', 'Detay'] as const;

export const TENDER_MAX_IMAGES = 8;
export const TENDER_MAX_PDFS = 3;
export const TENDER_MAX_VIDEOS = 2;
export const TENDER_CAPTION_MAX = 40;

// Liste/kart: "3 ek" (fotoğraf + PDF + video). Ek yoksa boş.
export function tenderAttachmentText(t: { mediaCount?: number; videoCount?: number }): string {
  const n = (t.mediaCount ?? 0) + (t.videoCount ?? 0);
  return n > 0 ? `${n} ek` : '';
}

// --- Aksesuar talebi -------------------------------------------------------

export const ACCESSORY_TYPES: { value: AccessoryType; label: string }[] = [
  { value: 'dugme', label: 'Düğme' },
  { value: 'fermuar', label: 'Fermuar' },
  { value: 'etiket', label: 'Etiket' },
  { value: 'aski', label: 'Askı' },
  { value: 'lastik', label: 'Lastik' },
  { value: 'kordon', label: 'Kordon' },
  { value: 'baski_nakis', label: 'Baskı / nakış' },
  { value: 'ambalaj', label: 'Ambalaj' },
  { value: 'diger', label: 'Diğer' },
];

export function accessoryTypeLabel(value: string | undefined): string {
  return ACCESSORY_TYPES.find((a) => a.value === value)?.label ?? '';
}
