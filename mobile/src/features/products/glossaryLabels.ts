// Sözlük ETİKETLERİNİN mobil kopyası (Faz 1). Eşanlamlılar ve normalizasyon
// yalnızca sunucuda (backend/src/domain/glossary); uygulama yalnızca etiket
// gösterir. Anahtarlar sunucudakiyle birebir aynı olmalı; backend'de
// `npm run check:catalog` eşitliği denetler.

export const FIBERS = [
  { key: 'pamuk', label: 'Pamuk' },
  { key: 'polyester', label: 'Polyester' },
  { key: 'elastan', label: 'Elastan' },
  { key: 'viskon', label: 'Viskon' },
  { key: 'poliamid', label: 'Poliamid (Naylon)' },
  { key: 'yun', label: 'Yün' },
  { key: 'akrilik', label: 'Akrilik' },
  { key: 'keten', label: 'Keten' },
  { key: 'modal', label: 'Modal' },
  { key: 'lyocell', label: 'Lyocell (Tencel)' },
  { key: 'ipek', label: 'İpek' },
  { key: 'bambu', label: 'Bambu' },
  { key: 'polipropilen', label: 'Polipropilen' },
  { key: 'kasmir', label: 'Kaşmir' },
  { key: 'metalik', label: 'Metalik iplik' },
  { key: 'diger', label: 'Diğer' },
] as const;

export const CERTIFICATES = [
  { key: 'oeko_tex_100', label: 'OEKO-TEX Standard 100' },
  { key: 'oeko_tex_made_in_green', label: 'OEKO-TEX Made in Green' },
  { key: 'gots', label: 'GOTS (Organik Tekstil)' },
  { key: 'grs', label: 'GRS (Geri Dönüştürülmüş)' },
  { key: 'rcs', label: 'RCS' },
  { key: 'ocs', label: 'OCS (Organik İçerik)' },
  { key: 'bci', label: 'BCI (Better Cotton)' },
  { key: 'bluesign', label: 'bluesign' },
  { key: 'iso_9001', label: 'ISO 9001' },
  { key: 'iso_14001', label: 'ISO 14001' },
  { key: 'reach', label: 'REACH uyumu' },
  { key: 'zdhc', label: 'ZDHC' },
  { key: 'higg', label: 'Higg Index' },
  { key: 'diger', label: 'Diğer' },
] as const;

export const WIDTH_TYPES = ['acik', 'tup'] as const;
export type WidthType = (typeof WIDTH_TYPES)[number];
export const WIDTH_TYPE_LABELS: Record<WidthType, string> = { acik: 'Açık en', tup: 'Tüp en' };

// Enin anlamı (Faz 1, Adım 4 madde 2): tüp kumaşta girilen en tek yüzün eni
// olabilir (açık en = 2×) ya da zaten açık en olabilir. Otomatik çarpma her
// zaman doğru olmadığı için kullanıcı seçmeden boş kalır.
export const WIDTH_MEANINGS = ['tup_tek_yuz', 'acik'] as const;
export type WidthMeaning = (typeof WIDTH_MEANINGS)[number];
export const WIDTH_MEANING_LABELS: Record<WidthMeaning, string> = {
  tup_tek_yuz: 'Tek yüz tüp eni',
  acik: 'Açık en',
};

export function widthMeaningLabel(key: string) {
  return WIDTH_MEANING_LABELS[key as WidthMeaning] ?? '';
}

// Hesapta kullanılacak açık en (sunucudaki effectiveWidthCm ile aynı kural).
export function effectiveWidthCm(widthCm: number, widthMeaning: string) {
  return widthMeaning === 'tup_tek_yuz' ? widthCm * 2 : widthCm;
}

// Pasaport kartındaki En sütununun altındaki küçük gri yazı; tek satır.
export function widthHintLabel(widthType: string, widthMeaning: string) {
  if (widthType === 'tup') {
    if (widthMeaning === 'tup_tek_yuz') return 'tüp, tek yüz';
    if (widthMeaning === 'acik') return 'tüp, açık en';
    return 'tüp en';
  }
  if (widthType === 'acik') return 'açık en';
  return '';
}

export function fiberLabel(key: string) {
  return FIBERS.find((f) => f.key === key)?.label ?? key;
}

export function certificateLabel(key: string) {
  return CERTIFICATES.find((c) => c.key === key)?.label ?? key;
}

export function widthTypeLabel(key: string) {
  return WIDTH_TYPE_LABELS[key as WidthType] ?? '';
}

// "%95 Pamuk %5 Elastan" (sunucudaki formatComposition ile aynı biçim).
export function formatComposition(items: readonly { fiber: string; percent: number }[]) {
  return [...items]
    .sort((a, b) => b.percent - a.percent)
    .map((i) => `%${Number.isInteger(i.percent) ? i.percent : String(i.percent).replace('.', ',')} ${fiberLabel(i.fiber)}`)
    .join(' ');
}
