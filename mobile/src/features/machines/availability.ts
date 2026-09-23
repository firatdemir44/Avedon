// Makine başına fason müsaitlik göstergesi. Sunucuda yalnızca `busyUntil`
// (bu tarihe kadar dolu) saklanır; görünen metin her çizimde BUGÜNE göre
// hesaplanır, böylece eskimez: tarih geçince kendiliğinden "Müsait" olur.

export type AvailabilityTone = 'success' | 'warning' | 'danger';

export interface AvailabilityStatus {
  tone: AvailabilityTone;
  /** "Müsait", "5 gün dolu", "2 hafta dolu", "12 Ekim'e kadar" */
  label: string;
  /** Müsaitken "Fason alınabilir". */
  detail: string | null;
  /** 14 günden eski güncellemede "3 hafta önce güncellendi". */
  stale: string | null;
  available: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_DAYS = 14;

// Ay adı + yönelme eki (Ekim'e, Kasım'a).
const MONTHS_DATIVE = [
  "Ocak'a",
  "Şubat'a",
  "Mart'a",
  "Nisan'a",
  "Mayıs'a",
  "Haziran'a",
  "Temmuz'a",
  "Ağustos'a",
  "Eylül'e",
  "Ekim'e",
  "Kasım'a",
  "Aralık'a",
];

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Bugünden itibaren kaç takvim günü dolu (0 = bugün müsait). */
export function busyDays(busyUntil: string | null, now: Date = new Date()): number {
  if (!busyUntil) return 0;
  const until = new Date(busyUntil);
  if (Number.isNaN(until.getTime())) return 0;
  return Math.max(0, Math.round((startOfDay(until) - startOfDay(now)) / DAY_MS));
}

export function availabilityStatus(
  busyUntil: string | null,
  updatedAt: string | null,
  now: Date = new Date()
): AvailabilityStatus {
  const days = busyDays(busyUntil, now);
  const stale = staleText(updatedAt, now);
  if (days <= 0) return { tone: 'success', label: 'Müsait', detail: 'Fason alınabilir', stale, available: true };
  if (days <= 7) return { tone: 'warning', label: days === 7 ? '1 hafta dolu' : `${days} gün dolu`, detail: null, stale, available: false };
  let label: string;
  if (days <= 14) label = days % 7 === 0 ? `${days / 7} hafta dolu` : `${days} gün dolu`;
  else {
    const until = new Date(busyUntil!);
    // Başka yılda yılın eki okunuşa bağlı olduğundan "12.01.2027 tarihine kadar".
    label =
      until.getFullYear() === now.getFullYear()
        ? `${until.getDate()} ${MONTHS_DATIVE[until.getMonth()]} kadar`
        : `${String(until.getDate()).padStart(2, '0')}.${String(until.getMonth() + 1).padStart(2, '0')}.${until.getFullYear()} tarihine kadar`;
  }
  return { tone: 'danger', label, detail: null, stale, available: false };
}

function staleText(updatedAt: string | null, now: Date): string | null {
  if (!updatedAt) return null;
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return null;
  const days = Math.floor((now.getTime() - date.getTime()) / DAY_MS);
  if (days <= STALE_DAYS) return null;
  if (days < 60) return `${Math.floor(days / 7)} hafta önce güncellendi`;
  if (days < 365) return `${Math.floor(days / 30)} ay önce güncellendi`;
  return '1 yıldan uzun süre önce güncellendi';
}

// Sahibin hızlı güncelleme seçenekleri (alt sayfa). Gün sayısı bugünden sayılır.
export const QUICK_AVAILABILITY: { label: string; days: number }[] = [
  { label: 'Müsait', days: 0 },
  { label: '1 hafta dolu', days: 7 },
  { label: '2 hafta dolu', days: 14 },
  { label: '1 ay dolu', days: 30 },
];

/** Gün sayısından busyUntil (o günün sonu); 0 → null (müsait). */
export function busyUntilFromDays(days: number, now: Date = new Date()): string | null {
  if (days <= 0) return null;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 23, 59, 0);
  return d.toISOString();
}

/** "12.10.2026" → o günün sonu; geçersiz ya da geçmişse null + hata. */
export function parseBusyDate(text: string, now: Date = new Date()): { iso: string | null; error: string | null } {
  const m = text.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!m) return { iso: null, error: 'Tarihi GG.AA.YYYY biçiminde yazın' };
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(year, month - 1, day, 23, 59, 0);
  if (d.getDate() !== day || d.getMonth() !== month - 1) return { iso: null, error: 'Böyle bir tarih yok' };
  if (startOfDay(d) <= startOfDay(now)) return { iso: null, error: 'Bugünden sonraki bir tarih seçin' };
  if (d.getTime() - now.getTime() > 365 * DAY_MS) return { iso: null, error: 'En fazla bir yıl sonrası seçilebilir' };
  return { iso: d.toISOString(), error: null };
}
