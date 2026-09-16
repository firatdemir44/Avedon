import { buildIndex } from './normalize';

// Lif sözlüğü. Veritabanında yalnızca ANAHTAR saklanır (ProductComposition.fiber);
// etiket gösterim içindir. Anahtar silinmez/yeniden adlandırılmaz (kayıtlı
// kompozisyonlar etiketsiz kalır); yenisi eklenir.
//
// Mobil kopya: mobile/src/features/products/glossaryLabels.ts (yalnızca etiket;
// eşanlamlılar yalnızca burada). scripts/check-catalog.ts eşitliği denetler.
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

export type FiberKey = (typeof FIBERS)[number]['key'];
export const FIBER_KEYS = new Set<string>(FIBERS.map((f) => f.key));

// Eşanlamlılar ve kısaltmalar (etiket standardı ISO 1833 kısaltmaları dahil).
// Kısaltmalar (CO, EA, PES ...) yalnızca kompozisyon bağlamında eşleştirilir;
// serbest aramada "el", "co" gibi kelimeler yanlış eşleşmesin.
// Fırat'tan gelecek atölye ağzı terimler buraya eklenir.
export const FIBER_SYNONYMS: Record<FiberKey, readonly string[]> = {
  pamuk: ['cotton', 'co', 'coton', 'cot', 'pamuklu', 'baumwolle', 'organik pamuk', 'organic cotton'],
  polyester: ['pes', 'pet', 'poly', 'polyster', 'polister', 'polyestr', 'pl', 'geri donusturulmus polyester', 'recycled polyester', 'rpet'],
  elastan: ['elastane', 'spandex', 'lycra', 'likra', 'ea', 'el', 'elast', 'lastik', 'elasthan'],
  viskon: ['viscose', 'viskoz', 'cv', 'vi', 'rayon', 'viscosa'],
  poliamid: ['polyamide', 'polyamid', 'naylon', 'nylon', 'pa', 'ny', 'nailon'],
  yun: ['yün', 'wool', 'wo', 'wv', 'merino', 'merinos', 'yun'],
  akrilik: ['acrylic', 'pan', 'akril', 'acrilico'],
  keten: ['linen', 'li', 'flax', 'lino'],
  modal: ['md', 'cmd', 'micromodal', 'mikromodal'],
  lyocell: ['tencel', 'ly', 'cly', 'liyosel'],
  ipek: ['silk', 'se', 'seide', 'seta'],
  bambu: ['bamboo', 'bambo'],
  polipropilen: ['polypropylene', 'pp', 'polipropilen'],
  kasmir: ['kaşmir', 'cashmere', 'ws', 'kasmir'],
  metalik: ['metallic', 'lurex', 'me', 'sim', 'simli'],
  diger: ['other', 'diger lif', 'other fiber'],
};

// Serbest metinde başka anlama gelebilecek kısaltmalar (ISO 1833 ve yaygın
// etiket kısaltmaları). "yün", "ipek" gibi gerçek kelimeler burada DEĞİL.
export const FIBER_ABBREVIATIONS = [
  'co', 'cot', 'pes', 'pet', 'pl', 'ea', 'el', 'cv', 'vi', 'pa', 'ny', 'wo', 'wv',
  'pan', 'li', 'md', 'cmd', 'ly', 'cly', 'se', 'pp', 'ws', 'me', 'sim',
] as const;

export const FIBER_INDEX = buildIndex(FIBER_SYNONYMS, { abbreviations: FIBER_ABBREVIATIONS });

export function fiberLabel(key: string) {
  return FIBERS.find((f) => f.key === key)?.label ?? key;
}

export function isValidFiber(key: string) {
  return FIBER_KEYS.has(key);
}
