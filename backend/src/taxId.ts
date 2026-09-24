// Firma vergi numarası: VKN 10 hane, şahıs firmalarında TCKN 11 hane.
// Kayıtta isteğe bağlı (boş ''), sonradan Firma bilgileri'nden eklenir.

export function normalizeTaxId(value: string): string {
  return value.replace(/[\s.-]/g, '');
}

export function isValidTaxId(value: string): boolean {
  return /^\d{10}$/.test(value) || /^\d{11}$/.test(value);
}
