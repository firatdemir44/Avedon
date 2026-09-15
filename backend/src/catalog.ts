// Kumaş kataloğu (Aşama A, 2026-09-15): çeşit → alt çeşit ve kullanım amaçları.
// Kaynak: orijinal Avedon tasarımı (docs/orijinal-proje-plani.md, "Ürün Kategorileri").
//
// Veritabanında yalnızca ANAHTARLAR saklanır; etiketler gösterim içindir, bir
// etiketi düzeltmek veriye dokunmaz. Bir anahtarı silmek/yeniden adlandırmak ise
// o anahtarla kayıtlı ürünleri "belirtilmemiş"e düşürür: yapılmaz, yenisi eklenir.
//
// AYNI LİSTE mobile/src/features/products/catalog.ts'te de var (uygulama çevrim
// dışıyken de etiket gösterebilsin diye). Birini değiştirince ötekini de değiştir;
// `npx tsx scripts/check-catalog.ts` ikisinin aynı olduğunu doğrular.

export const PRODUCT_TYPES = ['orme', 'raschel', 'dokuma', 'dantel', 'triko', 'diger'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const TYPE_LABELS: Record<ProductType, string> = {
  orme: 'Örme',
  raschel: 'Raschel',
  dokuma: 'Dokuma',
  dantel: 'Dantel',
  triko: 'Triko',
  diger: 'Diğer',
};

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

// Tasarımdaki "Kullanım amaçlarına göre kumaşlar". Bir ürünün birden fazla
// kullanım amacı olabilir.
export const USAGES: readonly CatalogOption[] = [
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
];

export const STOCK_UNITS = ['m', 'kg'] as const;
export type StockUnit = (typeof STOCK_UNITS)[number];

export const USAGE_KEYS = new Set(USAGES.map((u) => u.key));

// Boş alt çeşit "belirtilmemiş" demek ve her çeşit için geçerli.
export function isValidSubtype(type: ProductType, subtype: string) {
  return subtype === '' || SUBTYPES[type].some((s) => s.key === subtype);
}

const trLower = (value: string) => value.toLocaleLowerCase('tr-TR');

// Aramada "tül", "pantolon" gibi bir etiket yazılınca o anahtarla kayıtlı
// ürünler de bulunsun: metin, etiketlerin içinde geçen anahtarlara çevrilir.
export function matchCatalogKeys(search: string) {
  const q = trLower(search.trim());
  if (!q) return { types: [] as string[], subtypes: [] as string[], usages: [] as string[] };
  const types = PRODUCT_TYPES.filter((t) => trLower(TYPE_LABELS[t]).includes(q));
  const subtypes = PRODUCT_TYPES.flatMap((t) => SUBTYPES[t])
    .filter((s) => trLower(s.label).includes(q))
    .map((s) => s.key);
  const usages = USAGES.filter((u) => trLower(u.label).includes(q)).map((u) => u.key);
  return { types: [...types], subtypes, usages };
}
