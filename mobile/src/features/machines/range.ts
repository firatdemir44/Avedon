// Dönüştürülebilir makinelerde fine ve iğne aralık yazılır ("28-22",
// "2808-2210", "28/22"). Sunucudaki backend/src/machines/range.ts ile aynı kural:
// metin "-" ile normalize edilir, ilk sayı sayısal alana gider.

export interface ParsedRange {
  text: string;
  values: number[];
  first: number | null;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** Geçersizse null; boşsa text "" ve first null. */
export function parseRange(input: string | null | undefined): ParsedRange | null {
  const raw = (input ?? '').trim();
  if (!raw) return { text: '', values: [], first: null };
  const parts = raw.split(/\s*[-–/;]\s*|\s+/).filter(Boolean);
  const values: number[] = [];
  for (const part of parts) {
    if (!/^\d+([.,]\d+)?$/.test(part)) return null;
    const n = Number(part.replace(',', '.'));
    if (!(n > 0)) return null;
    values.push(n);
  }
  if (!values.length || values.length > 6) return null;
  return { text: values.map(fmt).join('-'), values, first: values[0] };
}

/** Görünen fine/iğne: aralık metni varsa o, yoksa sayı. "28-22" → "28–22". */
export function rangeDisplay(text: string | null | undefined, value: number | null | undefined): string {
  if (text) return text.replace(/-/g, '–');
  return value == null ? '' : fmt(value);
}
