import { tr } from '../../i18n';

// Firma formlarının (EditCompany ve CompanySetup) ortak alan doğrulamaları.
// Kurallar sunucudakiyle aynı (backend/src/routes/companies.ts).

// Sunucudaki alt sınırla aynı.
export const MIN_FOUNDED_YEAR = 1800;

export const MIN_COMPANY_NAME_LENGTH = 2;

// Boş bırakılabilir; doluysa 1800 ile bu yıl arasında dört haneli bir yıl.
// Hata varsa kullanıcıya gösterilecek metni, yoksa null döndürür.
export function foundedYearError(value: string, now: Date = new Date()): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const currentYear = now.getFullYear();
  const numeric = Number(trimmed);
  if (!/^\d{4}$/.test(trimmed) || numeric < MIN_FOUNDED_YEAR || numeric > currentYear) {
    return tr('Kuruluş yılı {min} ile {max} arasında dört haneli bir yıl olmalı.', { min: MIN_FOUNDED_YEAR, max: currentYear });
  }
  return null;
}

// Kuruluş yılı alanının PATCH gövdesindeki karşılığı: boşsa null (temizle).
export function foundedYearPayload(value: string): number | null {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
}

// Vergi numarası: VKN 10, şahıs firmasında TCKN 11 hane (sunucudaki
// backend/src/taxId.ts ile aynı). Boşluk, nokta, tire ayıklanır.
export function normalizeTaxId(value: string): string {
  return value.replace(/[\s.-]/g, '');
}

// Boşsa null (kayıtta atlanabilir); doluysa geçersizse kullanıcı metni.
export function taxIdError(value: string): string | null {
  const v = normalizeTaxId(value);
  if (v.length === 0) return null;
  if (!/^\d{10}$/.test(v) && !/^\d{11}$/.test(v)) {
    return tr('Vergi numarası 10 haneli (VKN) ya da şahıs firmasında 11 haneli (TCKN) olmalı.');
  }
  return null;
}
