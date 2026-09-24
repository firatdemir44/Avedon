import { useEffect, useState } from 'react';
import { fetchFx, type FxRates } from '../../api/client';
import { locale, tr } from '../../i18n';

// TCMB döviz satış kurları; istemci önbelleği 1 saat (fetchFx içinde).
export function useFx(): { fx: FxRates | null; failed: boolean } {
  const [fx, setFx] = useState<FxRates | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchFx()
      .then((r) => alive && setFx(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);
  return { fx, failed };
}

// "2026-09-23" → "23.09.2026"
export function fxDateLabel(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}

// Yabancı para tutarının TL karşılığı satırı: "≈ 1.234,56 ₺ (TCMB satış)". Kur yoksa null.
export function tlEquivalent(amount: number, currency: string, fx: FxRates | null): string | null {
  if (!fx || !(amount > 0)) return null;
  const rate = currency === 'USD' ? fx.usd : currency === 'EUR' ? fx.eur : currency === 'GBP' ? fx.gbp : null;
  if (!rate) return null;
  const tl = (amount * rate).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return tr('≈ {tl} ₺ (TCMB satış)', { tl });
}
