export function parseNumber(value: string): number {
  const normalized = value.trim().replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// Ürün ölçüleri (stok, gramaj, en) için: tam sayıda ondalık göstermez
// (220 → "220", 220.5 → "220,5", 1200 → "1.200"). YALNIZCA gösterim içindir —
// forma geri doldurmak için kullanmayın, parseNumber binlik noktayı ondalık sanar.
export function formatMeasure(value: number): string {
  return value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}

// Forma geri doldurmak için: binlik ayraç yok, ondalık virgül (220.5 → "220,5").
export function toInputNumber(value: number): string {
  return String(value).replace('.', ',');
}
