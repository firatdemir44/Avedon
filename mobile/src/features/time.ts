// Intl.RelativeTimeFormat kullanmıyoruz: Hermes'in Intl desteği platformlar
// arasında tutarsız, elle hesaplamak burada hem yeterli hem güvenli.
import { locale, tr } from '../i18n';
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diffMs = now.getTime() - date.getTime();
  if (Number.isNaN(diffMs)) return '';

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return tr('şimdi');
  if (minutes < 60) return tr('{n} dk', { n: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return tr('{n} sa', { n: hours });

  const days = Math.floor(hours / 24);
  if (days === 1) return tr('Dün');
  if (days < 7) return tr('{n} gün', { n: days });

  // 7 günden eski: "14 Eyl"; başka yıldaysa "14 Eyl 2025" (DESIGN.md §5).
  const base = `${date.getDate()} ${tr(TR_MONTHS_SHORT[date.getMonth()])}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

// Türkçe ay kısaltmaları; Intl'e bağlı kalmamak için elle.
const TR_MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

// Numune takibinde tasarımdaki "03/09/20 · 10:00" biçimi.
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toLocaleDateString(locale())} · ${formatClockTime(iso)}`;
}

// Doğrulama tarihinde gün gerekmiyor: "Eylül 2026" (Faz 2, Adım 7).
export function formatMonthYear(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
}

export function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function yesterdayOf(now: Date): Date {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return y;
}

// Sohbetteki gün ayracı (taslak CSohbet.dc.html): "Bugün", "Dün", "11.09.2026".
export function formatDayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (isSameCalendarDay(date, now)) return tr('Bugün');
  if (isSameCalendarDay(date, yesterdayOf(now))) return tr('Dün');
  return date.toLocaleDateString(locale());
}

// Mesajlar listesindeki saat (taslak CMesajlar.dc.html): bugün "10:09",
// dün "dün", daha eski "11.09.2026".
export function formatListTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (isSameCalendarDay(date, now)) return formatClockTime(iso);
  if (isSameCalendarDay(date, yesterdayOf(now))) return tr('dün');
  return date.toLocaleDateString(locale());
}

export function formatClockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
