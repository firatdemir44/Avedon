// Bakım sembolleri (Fırat 2026-09-21: "bakım ve yıkama bilgilerini yazı değil sembollerle girelim").
// Etiketlerdeki uluslararası bakım işaretlerinin (ISO 3758 düzeni) beş grubu; her gruptan en çok bir
// sembol seçilir. `shape` çizim tarifidir: mobil (react-native-svg) ve herkese açık pasaport sayfası
// aynı tariften çizer; bu dosya tek kaynaktır (mobil kopyası: mobile/src/features/care/symbols.ts).
export type CareGroup = 'yikama' | 'agartma' | 'kurutma' | 'utu' | 'kuru_temizleme';

export interface CareShape {
  base: 'tub' | 'triangle' | 'square' | 'iron' | 'circle';
  // Sembolün içine yazılan kısa metin (sıcaklık, P/F/W).
  text?: string;
  // Isı noktaları (kurutma ve ütü).
  dots?: 1 | 2 | 3;
  // Hassas program: altta tek çizgi.
  bar?: boolean;
  inner?: 'circle' | 'vline' | 'hline' | 'diag2' | 'hand';
  cross?: boolean;
}

export interface CareSymbol {
  key: string;
  group: CareGroup;
  label: string;
  labelEn: string;
  shape: CareShape;
}

export const CARE_GROUPS: { key: CareGroup; label: string }[] = [
  { key: 'yikama', label: 'Yıkama' },
  { key: 'agartma', label: 'Ağartma' },
  { key: 'kurutma', label: 'Kurutma' },
  { key: 'utu', label: 'Ütü' },
  { key: 'kuru_temizleme', label: 'Kuru temizleme' },
];

export const CARE_SYMBOLS: CareSymbol[] = [
  { key: 'wash_30', group: 'yikama', label: '30°C yıkama', labelEn: 'Wash at 30°C', shape: { base: 'tub', text: '30' } },
  { key: 'wash_30_gentle', group: 'yikama', label: '30°C hassas yıkama', labelEn: 'Wash at 30°C, gentle', shape: { base: 'tub', text: '30', bar: true } },
  { key: 'wash_40', group: 'yikama', label: '40°C yıkama', labelEn: 'Wash at 40°C', shape: { base: 'tub', text: '40' } },
  { key: 'wash_40_gentle', group: 'yikama', label: '40°C hassas yıkama', labelEn: 'Wash at 40°C, gentle', shape: { base: 'tub', text: '40', bar: true } },
  { key: 'wash_60', group: 'yikama', label: '60°C yıkama', labelEn: 'Wash at 60°C', shape: { base: 'tub', text: '60' } },
  { key: 'wash_95', group: 'yikama', label: '95°C yıkama', labelEn: 'Wash at 95°C', shape: { base: 'tub', text: '95' } },
  { key: 'wash_hand', group: 'yikama', label: 'Elde yıkama', labelEn: 'Hand wash', shape: { base: 'tub', inner: 'hand' } },
  { key: 'wash_no', group: 'yikama', label: 'Yıkanmaz', labelEn: 'Do not wash', shape: { base: 'tub', cross: true } },

  { key: 'bleach_any', group: 'agartma', label: 'Ağartılabilir', labelEn: 'Any bleach allowed', shape: { base: 'triangle' } },
  { key: 'bleach_oxygen', group: 'agartma', label: 'Yalnızca oksijenli ağartıcı', labelEn: 'Only oxygen bleach', shape: { base: 'triangle', inner: 'diag2' } },
  { key: 'bleach_no', group: 'agartma', label: 'Ağartıcı kullanılmaz', labelEn: 'Do not bleach', shape: { base: 'triangle', cross: true } },

  { key: 'tumble_low', group: 'kurutma', label: 'Makinede düşük ısıda kurutma', labelEn: 'Tumble dry, low heat', shape: { base: 'square', inner: 'circle', dots: 1 } },
  { key: 'tumble_normal', group: 'kurutma', label: 'Makinede normal ısıda kurutma', labelEn: 'Tumble dry, normal heat', shape: { base: 'square', inner: 'circle', dots: 2 } },
  { key: 'tumble_no', group: 'kurutma', label: 'Makinede kurutulmaz', labelEn: 'Do not tumble dry', shape: { base: 'square', inner: 'circle', cross: true } },
  { key: 'dry_line', group: 'kurutma', label: 'Asarak kurutma', labelEn: 'Line dry', shape: { base: 'square', inner: 'vline' } },
  { key: 'dry_flat', group: 'kurutma', label: 'Sererek kurutma', labelEn: 'Dry flat', shape: { base: 'square', inner: 'hline' } },

  { key: 'iron_110', group: 'utu', label: 'Düşük ısıda ütü (110°C)', labelEn: 'Iron, low (110°C)', shape: { base: 'iron', dots: 1 } },
  { key: 'iron_150', group: 'utu', label: 'Orta ısıda ütü (150°C)', labelEn: 'Iron, medium (150°C)', shape: { base: 'iron', dots: 2 } },
  { key: 'iron_200', group: 'utu', label: 'Yüksek ısıda ütü (200°C)', labelEn: 'Iron, high (200°C)', shape: { base: 'iron', dots: 3 } },
  { key: 'iron_no', group: 'utu', label: 'Ütülenmez', labelEn: 'Do not iron', shape: { base: 'iron', cross: true } },

  { key: 'dryclean_p', group: 'kuru_temizleme', label: 'Kuru temizleme (P)', labelEn: 'Dry clean (P)', shape: { base: 'circle', text: 'P' } },
  { key: 'dryclean_f', group: 'kuru_temizleme', label: 'Kuru temizleme (F)', labelEn: 'Dry clean (F)', shape: { base: 'circle', text: 'F' } },
  { key: 'wetclean_w', group: 'kuru_temizleme', label: 'Profesyonel ıslak temizleme (W)', labelEn: 'Professional wet clean (W)', shape: { base: 'circle', text: 'W' } },
  { key: 'dryclean_no', group: 'kuru_temizleme', label: 'Kuru temizleme yapılmaz', labelEn: 'Do not dry clean', shape: { base: 'circle', cross: true } },
];

const BY_KEY = new Map(CARE_SYMBOLS.map((s) => [s.key, s]));
export const isCareSymbol = (key: string) => BY_KEY.has(key);

// Her gruptan en çok bir sembol; grup sırasına dizilir.
export function normalizeCareSymbols(keys: readonly string[]): { ok: true; keys: string[] } | { ok: false; error: string } {
  const picked = new Map<CareGroup, string>();
  for (const key of keys) {
    const symbol = BY_KEY.get(key);
    if (!symbol) return { ok: false, error: 'unknown_care_symbol' };
    if (picked.has(symbol.group) && picked.get(symbol.group) !== key) return { ok: false, error: 'one_symbol_per_group' };
    picked.set(symbol.group, key);
  }
  return { ok: true, keys: CARE_GROUPS.map((g) => picked.get(g.key)).filter((k): k is string => !!k) };
}

export function parseCareSymbols(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((k): k is string => typeof k === 'string' && BY_KEY.has(k)) : [];
  } catch {
    return [];
  }
}

export const careSymbolsView = (keys: readonly string[]) => keys.map((k) => BY_KEY.get(k)).filter((s): s is CareSymbol => !!s);
