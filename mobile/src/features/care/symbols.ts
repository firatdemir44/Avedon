// Bakım sembolleri — TEK KAYNAK: backend/src/domain/care.ts
// Bu dosya oranın birebir kopyasıdır (tipler, gruplar, sembol listesi ve çizim
// tarifleri). Sunucudaki liste değişirse İKİSİ BİRLİKTE güncellenir; aksi
// halde mobil ile herkese açık pasaport sayfası (mobile/public/pasaport.html)
// farklı sembol gösterir.
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

export const careSymbolByKey = (key: string): CareSymbol | undefined => BY_KEY.get(key);

export const careSymbolsOfGroup = (group: CareGroup): CareSymbol[] =>
  CARE_SYMBOLS.filter((s) => s.group === group);

// Bilinmeyen anahtarları atar ve grup sırasına dizer (sunucudaki
// normalizeCareSymbols ile aynı sıra); ekranda göstermek için.
export function careSymbolsView(keys: readonly string[]): CareSymbol[] {
  const order = new Map(CARE_GROUPS.map((g, i) => [g.key, i]));
  return keys
    .map((k) => BY_KEY.get(k))
    .filter((s): s is CareSymbol => !!s)
    .sort((a, b) => (order.get(a.group) ?? 0) - (order.get(b.group) ?? 0));
}

// Grup başına en çok bir sembol: aynı gruptan yeni bir seçim eskisinin yerine
// geçer, seçili sembole yeniden basmak seçimi kaldırır.
export function toggleCareSymbol(selected: readonly string[], key: string): string[] {
  const symbol = BY_KEY.get(key);
  if (!symbol) return [...selected];
  if (selected.includes(key)) return selected.filter((k) => k !== key);
  const rest = selected.filter((k) => BY_KEY.get(k)?.group !== symbol.group);
  return careSymbolsView([...rest, key]).map((s) => s.key);
}
