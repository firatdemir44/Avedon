// Kumaş kataloğu: çeşit → alt çeşit ve kullanım amaçları (Aşama A, 2026-09-15).
//
// SUNUCUDAKİ backend/src/catalog.ts İLE AYNI OLMALI: sunucu anahtarları doğrular
// ve saklar, uygulama etiketleri gösterir. Birini değiştirince ötekini de
// değiştir; backend'de `npx tsx scripts/check-catalog.ts` farkı yakalar.
// Anahtar silinmez/yeniden adlandırılmaz (kayıtlı ürünler etiketsiz kalır).
import { tr } from '../../i18n';
import { trLabels } from '../trLabels';

export const PRODUCT_TYPES = ['orme', 'raschel', 'dokuma', 'dantel', 'triko', 'diger'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

// İplik de bir üründür (Faz 2, Adım 6) ama KUMAŞ çeşidi değildir: kumaş
// kataloğunun çeşit listesine (PRODUCT_TYPES) girmez, kendi dizininde
// (/api/yarns) listelenir. Sunucudaki YARN_PRODUCT_TYPE ile aynı.
export const YARN_PRODUCT_TYPE = 'iplik';
export type YarnProductType = typeof YARN_PRODUCT_TYPE;
// Ürün satırlarında görülebilecek bütün türler.
export type AnyProductType = ProductType | YarnProductType;

export function isYarnType(type: string): type is YarnProductType {
  return type === YARN_PRODUCT_TYPE;
}

export const TYPE_LABELS: Record<ProductType, string> = trLabels({
  orme: 'Örme',
  raschel: 'Raschel',
  dokuma: 'Dokuma',
  dantel: 'Dantel',
  triko: 'Triko',
  diger: 'Diğer',
});

export interface CatalogOption {
  key: string;
  label: string;
}

export const SUBTYPES: Record<ProductType, readonly CatalogOption[]> = {
  orme: [
    { key: 'suprem', label: 'Süprem' },
    { key: 'iki_iplik', label: 'İki İplik' },
    { key: 'uc_iplik', label: 'Üç İplik' },
    { key: 'interlok', label: 'İnterlok' },
    { key: 'ribana', label: 'Ribana' },
    { key: 'kaskorse', label: 'Kaşkorse' },
    { key: 'pike', label: 'Pike Lakost' },
    { key: 'double_face', label: 'Double Face' },
    { key: 'scuba', label: 'Scuba' },
    { key: 'mira', label: 'Mira' },
    { key: 'ottoman', label: 'Ottoman' },
    { key: 'selanik', label: 'Selanik' },
    { key: 'polar', label: 'Polar' },
    { key: 'kadife_orme', label: 'Örme Kadife' },
  ],
  raschel: [
    { key: 'elastanli_tul', label: 'Elastanlı Tül' },
    { key: 'elastansiz_tul', label: 'Elastansız Tül' },
    { key: 'grek_tul', label: 'Grek Tül' },
    { key: 'sanal_tul', label: 'Sanal Tül' },
    { key: 'astarlik', label: 'Astarlık' },
    { key: 'file', label: 'File' },
    { key: 'jakar_raschel', label: 'Jakarlı Raschel' },
  ],
  dokuma: [
    { key: 'poplin', label: 'Poplin' },
    { key: 'gabardin', label: 'Gabardin' },
    { key: 'keten', label: 'Keten' },
    { key: 'denim', label: 'Denim' },
    { key: 'kadife', label: 'Kadife' },
    { key: 'saten', label: 'Saten' },
    { key: 'sifon', label: 'Şifon' },
    { key: 'krep', label: 'Krep' },
    { key: 'viskon', label: 'Viskon' },
  ],
  dantel: [
    { key: 'gipur', label: 'Gipür' },
    { key: 'brode', label: 'Brode' },
    { key: 'likrali_dantel', label: 'Likralı Dantel' },
    { key: 'kordone', label: 'Kordone Dantel' },
  ],
  triko: [
    { key: 'duz_triko', label: 'Düz Triko' },
    { key: 'orgulu_triko', label: 'Örgülü Triko' },
    { key: 'jakar_triko', label: 'Jakarlı Triko' },
  ],
  diger: [],
};
Object.values(SUBTYPES).forEach((list) => trLabels(list as CatalogOption[]));

export const USAGES: readonly CatalogOption[] = trLabels([
  { key: 'pantolonluk', label: 'Pantolonluk' },
  { key: 'taytlik', label: 'Taytlık' },
  { key: 'tisortluk', label: 'Tişörtlük' },
  { key: 'gomleklik', label: 'Gömleklik' },
  { key: 'elbiselik', label: 'Elbiselik' },
  { key: 'sweatshirt', label: 'Sweatshirt' },
  { key: 'esofman', label: 'Eşofman' },
  { key: 'mayoluk', label: 'Mayoluk' },
  { key: 'spor_giyim', label: 'Spor Giyim' },
  { key: 'ic_giyim', label: 'İç Giyim' },
  { key: 'dis_giyim', label: 'Dış Giyim' },
  { key: 'astar', label: 'Astar' },
  { key: 'cocuk_giyim', label: 'Çocuk Giyim' },
  { key: 'ev_tekstili', label: 'Ev Tekstili' },
]);

export const STOCK_UNITS = ['m', 'kg'] as const;

// Firma türü (orijinal tasarım: "Şirket Tipi"). Kullanıcı hesap türünden ayrı:
// hesap türü kişinin rolü, bu firmanın ne iş yaptığı.
export const COMPANY_TYPES = trLabels([
  { key: 'kumas_uretici', label: 'Kumaş Üreticisi' },
  { key: 'konfeksiyon', label: 'Konfeksiyon / Giyim Üreticisi' },
  { key: 'boyahane', label: 'Boyahane / Terbiye' },
  { key: 'iplik', label: 'İplik Üreticisi' },
  { key: 'aksesuar', label: 'Aksesuar' },
  { key: 'baski', label: 'Baskı / Nakış' },
  { key: 'toptanci', label: 'Toptancı / Tedarikçi' },
  { key: 'diger', label: 'Diğer' },
] as const);

export const COMPANY_TYPE_KEYS = new Set(COMPANY_TYPES.map((t) => t.key));

// Boş = belirtilmemiş, her zaman geçerli.
export function isValidCompanyType(value: string) {
  return value === "" || COMPANY_TYPE_KEYS.has(value as (typeof COMPANY_TYPES)[number]['key']);
}

// --- Kumaş pasaportu listeleri (Faz 1, Adım 2) ---
// BAŞLANGIÇ değerleri; Fırat'ın listesiyle güncellenecek. Anahtar silinmez.
export const YARN_TYPES = trLabels([
  { key: 'penye', label: 'Penye (ring)' },
  { key: 'karde', label: 'Karde' },
  { key: 'open_end', label: 'Open End' },
  { key: 'kompakt', label: 'Kompakt' },
  { key: 'dty', label: 'DTY' },
  { key: 'fdy', label: 'FDY' },
  { key: 'poy', label: 'POY' },
  { key: 'vortex', label: 'Vortex' },
  { key: 'diger', label: 'Diğer' },
] as const);

export const YARN_ROLES = trLabels([
  { key: 'ana', label: 'Ana iplik' },
  { key: 'ilave', label: 'İlave iplik' },
  { key: 'ekstra', label: 'Ekstra iplik' },
] as const);

export const YARN_UNITS = [
  { key: 'ne', label: 'Ne' },
  { key: 'nm', label: 'Nm' },
  { key: 'tex', label: 'tex' },
  { key: 'dtex', label: 'dtex' },
  { key: 'denye', label: 'Denye' },
] as const;

// Boya / apre etiketleri (çoklu seçim, usages ile aynı desen).
export const FINISH_TAGS = trLabels([
  { key: 'sardonlu', label: 'Şardonlu' },
  { key: 'yikamali', label: 'Yıkamalı' },
  { key: 'peach', label: 'Peach (şeftali tuşe)' },
  { key: 'silikonlu', label: 'Silikonlu' },
  { key: 'antipilling', label: 'Anti-pilling' },
  { key: 'su_itici', label: 'Su itici' },
  { key: 'alev_almaz', label: 'Alev almaz' },
  { key: 'antibakteriyel', label: 'Antibakteriyel' },
  { key: 'uv_koruma', label: 'UV koruma' },
  { key: 'merserize', label: 'Merserize' },
  { key: 'sanforlu', label: 'Sanforlu' },
  { key: 'baskili', label: 'Baskılı' },
  { key: 'duz_boya', label: 'Düz boya' },
  { key: 'melanj', label: 'Melanj' },
] as const);

export const PRICE_CURRENCIES = ['TRY', 'USD', 'EUR'] as const;

export const FINISH_TAG_KEYS = new Set<string>(FINISH_TAGS.map((t) => t.key));
export const YARN_TYPE_KEYS = new Set<string>(YARN_TYPES.map((t) => t.key));
export const YARN_ROLE_KEYS = new Set<string>(YARN_ROLES.map((t) => t.key));
export const YARN_UNIT_KEYS = new Set<string>(YARN_UNITS.map((t) => t.key));
export type StockUnit = (typeof STOCK_UNITS)[number];

export const STOCK_UNIT_LABELS: Record<StockUnit, { short: string; long: string }> = {
  m: trLabels({ short: 'm', long: 'metre' }, ['long']),
  kg: trLabels({ short: 'kg', long: 'kilogram' }, ['long']),
};

// Sunucu yeni bir çeşit gönderirse (uygulama güncellenmemişse) anahtarın kendisi görünür.
// İplik TYPE_LABELS'ta değil (o kumaş çeşitlerinin listesi), etiketi burada.
export function typeLabel(type: string) {
  if (isYarnType(type)) return tr('İplik');
  return TYPE_LABELS[type as ProductType] ?? type;
}

export function subtypeLabel(type: string, subtype: string) {
  if (!subtype) return '';
  return SUBTYPES[type as ProductType]?.find((s) => s.key === subtype)?.label ?? subtype;
}

export function usageLabel(key: string) {
  return USAGES.find((u) => u.key === key)?.label ?? key;
}

// "Örme · Süprem" ya da yalnızca "Örme".
export function categoryLabel(type: string, subtype: string) {
  const sub = subtypeLabel(type, subtype);
  return sub ? `${typeLabel(type)} · ${sub}` : typeLabel(type);
}

// Sunucu bilinmeyen bir tür gönderirse anahtarın kendisi görünür.
export function companyTypeLabel(value: string) {
  return COMPANY_TYPES.find((t) => t.key === value)?.label ?? value;
}

export function finishTagLabel(key: string) {
  return FINISH_TAGS.find((t) => t.key === key)?.label ?? key;
}

export function yarnTypeLabel(key: string) {
  return YARN_TYPES.find((t) => t.key === key)?.label ?? key;
}

export function yarnRoleLabel(key: string) {
  return YARN_ROLES.find((r) => r.key === key)?.label ?? key;
}

export function yarnUnitLabel(key: string) {
  return YARN_UNITS.find((u) => u.key === key)?.label ?? key;
}
