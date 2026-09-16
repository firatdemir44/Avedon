import { PRODUCT_TYPES, SUBTYPES, TYPE_LABELS, type ProductType } from '../../catalog';
import { buildIndex, findTerms, matchTerm, type TermMatch } from './normalize';

// Örgü / kumaş çeşidi eşanlamlıları. Yeni bir alan AÇMAZ: yol haritasındaki
// "orgu_tipi" kodda zaten Product.type + Product.subtype (Aşama A). Bu dosya
// yalnızca "hangi yazım hangi anahtara gider" katmanını ekler; arama ve
// pasaport çıkarımı bunu kullanır.
//
// Anahtarlar catalog.ts'teki SUBTYPES ile aynı olmalı; test dosyası bunu denetler.
export const SUBTYPE_SYNONYMS: Record<string, readonly string[]> = {
  // Örme
  suprem: ['süprem', 'single jersey', 'singlejersey', 'tek plaka', 'jersey', 'sj', 'suprem'],
  iki_iplik: ['iki iplik', '2 iplik', 'two thread fleece', '2 thread', 'iki iplik sardonlu'],
  uc_iplik: ['üç iplik', '3 iplik', 'three thread fleece', '3 thread', 'sardonlu uc iplik'],
  interlok: ['interlock', 'interlok'],
  ribana: ['rib', '1x1 rib', '2x2 rib', 'ribbed', 'ribana'],
  kaskorse: ['kaşkorse', 'kaskorse', 'kaskors'],
  pike: ['lakost', 'lacoste', 'pique', 'pike lakost'],
  double_face: ['double face', 'çift yüz', 'cift yuz', 'doubleface'],
  scuba: ['dalgıç', 'dalgic', 'scuba'],
  mira: ['mira'],
  ottoman: ['otoman', 'ottoman'],
  selanik: ['french terry', 'selanik'],
  polar: ['fleece', 'polar'],
  kadife_orme: ['örme kadife', 'orme kadife', 'velour', 'velvet knit', 'kadife orme'],
  // Raschel
  elastanli_tul: ['elastanlı tül', 'elastanli tul', 'power net', 'powernet', 'likralı tül', 'likrali tul', 'stretch tulle'],
  elastansiz_tul: ['elastansız tül', 'elastansiz tul', 'tül', 'tul', 'tulle'],
  grek_tul: ['grek tül', 'grek tul', 'grek'],
  sanal_tul: ['sanal tül', 'sanal tul'],
  astarlik: ['astarlık', 'astar', 'lining', 'astarlik'],
  file: ['mesh', 'file kumas', 'file'],
  jakar_raschel: ['jakar raschel', 'jakarlı raschel', 'jakarli raschel', 'jacquard raschel'],
  // Dokuma
  poplin: ['poplen', 'poplin'],
  gabardin: ['gabardine', 'gabardin'],
  keten: ['keten dokuma', 'keten kumas', 'linen fabric'],
  denim: ['kot', 'jean', 'jeans', 'denim'],
  kadife: ['velvet', 'kadife dokuma', 'kadife'],
  saten: ['satin', 'saten'],
  sifon: ['şifon', 'chiffon', 'sifon'],
  krep: ['crepe', 'krep'],
  viskon: ['viskon dokuma', 'viskon kumas', 'viscose fabric'],
  // Dantel
  gipur: ['gipür', 'guipure', 'gipur'],
  brode: ['broderie', 'embroidery lace', 'brode'],
  likrali_dantel: ['likralı dantel', 'likrali dantel', 'elastanlı dantel', 'stretch lace'],
  kordone: ['cord lace', 'kordone'],
  // Triko
  duz_triko: ['düz triko', 'duz triko', 'plain knit'],
  orgulu_triko: ['örgülü triko', 'orgulu triko', 'cable knit'],
  jakar_triko: ['jakarlı triko', 'jakarli triko', 'jacquard knit'],
};

export const TYPE_SYNONYMS: Record<ProductType, readonly string[]> = {
  orme: ['örme', 'orme', 'knit', 'knitted', 'orgu'],
  raschel: ['raschel', 'rachel', 'rasel'],
  dokuma: ['dokuma', 'woven'],
  dantel: ['dantel', 'lace'],
  triko: ['triko', 'knitwear'],
  diger: ['diğer', 'diger'],
};

export const SUBTYPE_INDEX = buildIndex(SUBTYPE_SYNONYMS);
export const TYPE_INDEX = buildIndex(TYPE_SYNONYMS);

// Alt çeşidin hangi çeşide ait olduğu.
const SUBTYPE_TO_TYPE = new Map<string, ProductType>();
for (const type of PRODUCT_TYPES) {
  for (const sub of SUBTYPES[type]) SUBTYPE_TO_TYPE.set(sub.key, type);
}

export function typeOfSubtype(subtype: string): ProductType | null {
  return SUBTYPE_TO_TYPE.get(subtype) ?? null;
}

export interface KnitMatch {
  type: ProductType | null;
  subtype: string | null;
  confidence: number;
  matchedText: string;
}

// Serbest metinden çeşit + alt çeşit: "süprem" → orme/suprem; "örme kumaş" →
// orme/-; "single jersey 30/1" → orme/suprem. Alt çeşit bulunursa çeşit ondan
// türetilir (metinde yazan çeşitle çelişirse alt çeşit kazanır: daha özgül).
export function matchKnit(text: string): KnitMatch {
  const sub = findTerms(text, SUBTYPE_INDEX)[0] ?? null;
  if (sub) {
    return { type: typeOfSubtype(sub.key), subtype: sub.key, confidence: sub.confidence, matchedText: sub.matchedText };
  }
  const type = findTerms(text, TYPE_INDEX)[0] ?? null;
  if (type) {
    return { type: type.key as ProductType, subtype: null, confidence: type.confidence * 0.9, matchedText: type.matchedText };
  }
  return { type: null, subtype: null, confidence: 0, matchedText: '' };
}

// Arama için: metindeki tüm çeşit ve alt çeşit anahtarları (eşanlamlılar
// dahil). catalog.ts'teki matchCatalogKeys yalnızca etiket metnine bakıyordu;
// bu, "single jersey" aramasının suprem'i bulmasını sağlar.
export function knitSearchKeys(search: string): { types: ProductType[]; subtypes: string[] } {
  const types = new Set<ProductType>();
  const subtypes = new Set<string>();
  for (const m of findTerms(search, SUBTYPE_INDEX)) subtypes.add(m.key);
  for (const m of findTerms(search, TYPE_INDEX)) types.add(m.key as ProductType);
  // Tek kelimelik arama tam eşleşmiyorsa etiket parçası da denenir ("süpr").
  return { types: [...types], subtypes: [...subtypes] };
}

export function subtypeMatch(text: string): TermMatch | null {
  return matchTerm(text, SUBTYPE_INDEX);
}

export { TYPE_LABELS };
