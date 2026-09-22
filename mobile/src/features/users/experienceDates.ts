// Deneyim tarihleri: sunucu ay+yıl sayısı saklıyor, gösterim ve süre hesabı
// tamamen istemcide (backend'e dokunulmadı, 2026-09-22).

export const MONTH_NAMES_SHORT = [
  'Oca',
  'Şub',
  'Mar',
  'Nis',
  'May',
  'Haz',
  'Tem',
  'Ağu',
  'Eyl',
  'Eki',
  'Kas',
  'Ara',
] as const;

export const MONTH_NAMES_LONG = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
] as const;

export function monthLabel(month: number) {
  return MONTH_NAMES_SHORT[Math.min(Math.max(month, 1), 12) - 1];
}

// "Şub 2001"
function point(month: number, year: number) {
  return `${monthLabel(month)} ${year}`;
}

// LinkedIn gibi kapsayıcı sayım: aynı ay başlayıp biten görev "1 ay".
function humanDuration(months: number) {
  if (months <= 0) return '';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years) parts.push(`${years} yıl`);
  if (rest) parts.push(`${rest} ay`);
  return parts.join(' ');
}

export interface ExperiencePeriod {
  startMonth: number;
  startYear: number;
  endMonth: number | null;
  endYear: number | null;
}

/**
 * "Şub 2001 - Devam ediyor · 25 yıl 8 ay" satırı. Bitiş yoksa bugüne kadar
 * sayılır; bitiş başlangıçtan önceyse süre yazılmaz (bozuk veriyi gizlemek
 * yerine tarihleri olduğu gibi gösteriyoruz).
 */
export function formatExperiencePeriod(exp: ExperiencePeriod, now = new Date()) {
  const start = exp.startYear * 12 + exp.startMonth;
  const ongoing = exp.endYear == null || exp.endMonth == null;
  const endLabel = ongoing ? 'Devam ediyor' : point(exp.endMonth!, exp.endYear!);
  const end = ongoing ? now.getFullYear() * 12 + (now.getMonth() + 1) : exp.endYear! * 12 + exp.endMonth!;
  const duration = humanDuration(end - start + 1);
  const range = `${point(exp.startMonth, exp.startYear)} - ${endLabel}`;
  return duration ? `${range} · ${duration}` : range;
}
