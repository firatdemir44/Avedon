import type { Prisma } from '@prisma/client';

// Dönüştürülebilir makinelerde fine ve iğne aralık olarak yazılır: "28-22",
// "2808-2210", "28/22", "28 - 26". Metin "-" ile normalize edilir; ilk sayı
// sayısal alana (gauge/needles) yazılır ki eski aramalar da çalışsın.

export interface ParsedRange {
  /** Normalize metin: "28-22"; tek sayıda "28"; boşsa "". */
  text: string;
  values: number[];
  first: number | null;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

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

// "n" değeri sayısal alanda ya da aralık metninin herhangi bir parçasında.
export function rangeMatch(
  numberField: 'gauge' | 'needles',
  textField: 'gaugeText' | 'needlesText',
  n: number
): Prisma.MachineWhereInput {
  const s = fmt(n);
  return {
    OR: [
      { [numberField]: n },
      { [textField]: s },
      { [textField]: { startsWith: `${s}-` } },
      { [textField]: { endsWith: `-${s}` } },
      { [textField]: { contains: `-${s}-` } },
    ],
  };
}
