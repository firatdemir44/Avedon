// Adımların ortak tipleri ve işlem bağlamı. Her adım ayrı modül: Ctx okur, kararını ve
// işlem kaydını yazar. Piksel işlemleri en sonda tek geçişte uygulanır (render.ts).

import type { Mask, Plane, RGB } from './goruntu';

export type Risk = 'guvenli' | 'dikkat' | 'riskli';

export type LogEntry = {
  adim: string;
  risk: Risk | null;
  durum: 'uygulandi' | 'atlandi' | 'bilgi';
  doz?: number;
  not?: string;
  olcum?: Record<string, number | string | boolean | null>;
};

/** Yeniden çekim mesajları: kod → sade Türkçe. */
export const YENIDEN_CEKIM_MESAJ: Record<string, string> = {
  bulanik: 'Fotoğraf bulanık çıktı, telefonu sabit tutup tekrar çekin',
  parlama: 'Işık kumaşın üzerinde parlama yapmış, flaşı kapatıp gün ışığında tekrar çekin',
  karanlik: 'Fotoğraf çok karanlık, daha aydınlık bir yerde tekrar çekin',
  kumas_kucuk: 'Kumaş kadrajda çok küçük kalmış, telefonu kumaşa yaklaştırıp tekrar çekin',
  duz_bolge_yok: 'Kumaşta düz bir bölge bulunamadı, kumaşı düz serip tekrar çekin',
  cozunurluk_dusuk: 'Fotoğrafın çözünürlüğü düşük, telefon kamerasıyla yeniden çekin',
};

/** 3×3 homografi: [rektifiye uzay] → [analiz kopyası pikselleri]. Satır-ana sıralı 9 sayı. */
export type H3 = [number, number, number, number, number, number, number, number, number];

export type Analysis = {
  /** Analiz kopyası (uzun kenar ≤ ANALIZ_UZUN_KENAR), EXIF yönü uygulanmış sRGB. */
  img: RGB;
  L: Plane; // 0..255 parlaklık
  /** Analiz kopyası → kaynak tam çözünürlük ölçek çarpanı (kaynak = analiz × olcek). */
  olcek: number;
  kaynak: { w: number; h: number };
  /** Kaynak (EXIF yönü uygulanmış) sharp örneği; ≤20 MP'de bellekteki ham kopyadan. */
  kaynakSharp: () => Promise<import('sharp').Sharp>;
  /** Kaynaktan bölge oku (isteğe bağlı ölçekle). */
  oku: (left: number, top: number, width: number, height: number, scale?: number) => Promise<RGB>;
  /** Ham kopyayı bellekten bırak. */
  serbestBirak: () => void;
};

export type Segmentation = {
  mask: Mask; // analiz çözünürlüğünde
  guven: number; // 0..1
  kadrajDolu: boolean; // maske kadrajın büyük kısmını kaplıyor (kenar görünmüyor)
  alanOrani: number; // maske alanı / kadraj
  zemin: { lab: [number, number, number]; oran: number } | null; // kumaş dışı baskın renk
  kumasLab: [number, number, number][]; // kumaş renk kümeleri
  yariSaydam: boolean;
  sinir: Mask; // kumaş dışı (zemin/etiket) piksel maskesi, referans için
};

export type Ctx = {
  log: LogEntry[];
  uyarilar: string[];
  olcumler: Record<string, unknown>;
  an: Analysis;
  seg?: Segmentation;
  /** Keskinlik blok haritası (adım 0'da ölçülür, adım 5 kullanır). */
  keskinlik?: { map: Plane; blokAn: number; p90: number; p50: number };
  /** Geometri: rektifiye uzaydan analiz koordinatlarına homografi (adım 2). */
  H: H3;
  /** Rektifiye uzayda kumaş maskesi (adım 2 sonrası; geometri kimlikse seg.mask ile aynı). */
  rmask?: Mask;
  /** Işık dengeleme kazanç alanı (analiz koordinatlarında, küçük düzlem) — adım 3. */
  isikAlani?: { plane: Plane; olcek: number } | null;
  /** Beyaz dengesi doğrusal kazançları — adım 4. */
  wb?: [number, number, number];
  /** Katalog kırpımı (rektifiye uzayda, analiz ölçeğinde kare) — adım 5/7. */
  kirpim?: { x: number; y: number; side: number };
  /** Yakın plan kırpımı (rektifiye uzay, analiz ölçeği; kaynakta 1024 px'e denk) — adım 5. */
  yakinKirpim?: { x: number; y: number; side: number };
  /** Doku belirginleştirme dozu — adım 6. */
  keskinlik_doz?: number;
  /** Çıktı kararları — adım 8. */
  cozunurluk?: { ikiKat: boolean; olcek: number };
  /** Kompozisyon kararı — adım 9. */
  kompozisyon?: { zemin: 'notr' | 'orijinal'; kesme: boolean };
};

export const IDENTITY: H3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function applyH(H: H3, x: number, y: number): [number, number] {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

export function invertH(H: H3): H3 {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g);
  const G = b * f - c * e, Hh = -(a * f - c * d), I = a * e - b * d;
  return [A / det, D / det, G / det, B / det, E / det, Hh / det, C / det, F / det, I / det];
}

export function mulH(A: H3, B: H3): H3 {
  const r: number[] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r.push(A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]);
  return r as H3;
}

export function log(ctx: Ctx, e: LogEntry) {
  ctx.log.push(e);
}
