// Adım 5 — En düz / en net bölgeyi seçme (Güvenli). Üretken kırışıklık silme YOK: yalnızca
// kırpımın nereden alınacağı seçilir.
//  Kırışıklık haritası: orta frekans bandı |gauss(L,2) − gauss(L,10)| geniş pencerede ortalanır;
//    kıvrım/kat gölgeleri burada yüksek çıkar. Doğal kabartma dokular (bürümcük, bombeli, peluş,
//    dalgalı raschel) tüm kumaşta aynı çıkar: haritanın değişim katsayısı düşükse "kırışık" değil
//    "doku"dur ve pencere seçiminde bu terim devre dışı kalır (tutarlılık ölçütü).
//  Keskinlik: adım 0'daki ince ölçek enerji blok haritası.
//  Aday pencereler rektifiye uzayda, tamamen kumaş maskesi içinde; puan = −kırışıklık + keskinlik
//    − merkezden uzaklık cezası.

import { boxSum, gauss, half, integral, largestSquare, percentile, plane, type Mask, type Plane } from './goruntu';
import { applyH, log, type Ctx } from './tip';

export type DuzBolgeParams = {
  bandKucuk: number; // band-pass alt σ
  bandBuyuk: number; // band-pass üst σ
  pencere: number; // kırışıklık enerjisi ortalama penceresi σ
  tutarlilikEsigi: number; // kırışıklık haritası CV bunun altındaysa doku sayılır (terim kapanır)
  merkezCezasi: number; // z-puanı başına merkezden uzaklık (kadraj oranı)
  adimOrani: number; // pencere kayma adımı (kenarın oranı)
  ornek: number; // pencere içi örnekleme ızgarası (n×n)
};

export const DUZ_BOLGE: DuzBolgeParams = { bandKucuk: 2, bandBuyuk: 10, pencere: 12, tutarlilikEsigi: 0.35, merkezCezasi: 0.6, adimOrani: 0.1, ornek: 5 };

/** kirisik: analiz koordinatlarının 1/olcek'i ölçeğinde harita (hız için yarı çözünürlük). */
export type BolgeHaritalari = { kirisik: Plane; olcek: number; kirisikCV: number; dokuMu: boolean };

/** Kırışıklık haritası (analiz koordinatları / 2). */
export function kirisikHaritasi(ctx: Ctx, p: DuzBolgeParams = DUZ_BOLGE): BolgeHaritalari {
  const L = half(ctx.an.L);
  const m0 = ctx.seg!.mask;
  const mask: Mask = { w: L.w, h: L.h, d: new Uint8Array(L.w * L.h) };
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) mask.d[y * L.w + x] = m0.d[2 * y * m0.w + 2 * x];
  const g1 = gauss(L, p.bandKucuk / 2), g2 = gauss(L, p.bandBuyuk / 2);
  const band = plane(L.w, L.h);
  for (let i = 0; i < band.d.length; i++) band.d[i] = mask.d[i] ? Math.abs(g1.d[i] - g2.d[i]) : 0;
  const E = gauss(band, p.pencere / 2);
  const vals: number[] = [];
  for (let i = 0; i < E.d.length; i += 7) if (mask.d[i]) vals.push(E.d[i]);
  const arr = Float32Array.from(vals);
  const med = percentile(arr, 0.5) || 1e-6;
  let m = 0, m2 = 0;
  for (const v of vals) { m += v; m2 += v * v; }
  m /= vals.length || 1;
  const cv = m > 0 ? Math.sqrt(Math.max(0, m2 / (vals.length || 1) - m * m)) / m : 0;
  for (let i = 0; i < E.d.length; i++) E.d[i] /= med;
  return { kirisik: E, olcek: 2, kirisikCV: cv, dokuMu: cv < p.tutarlilikEsigi };
}

type Pencere = { x: number; y: number; side: number; puan: number; kirisik: number; keskinlik: number };

/**
 * Rektifiye uzayda `side` kenarlı, tamamen maske içinde kalan en iyi pencereyi bulur.
 * agirlik.kirisik = 0 verilirse yalnız keskinliğe bakılır (yakın plan).
 */
export function enIyiPencere(ctx: Ctx, har: BolgeHaritalari, side: number, agirlik = { kirisik: 1, keskinlik: 0.7 }, p: DuzBolgeParams = DUZ_BOLGE): Pencere | null {
  const rmask = ctx.rmask!;
  const { w, h } = rmask;
  side = Math.floor(Math.min(side, w, h));
  if (side < 8) return null;
  const I = integral(rmask.d, w, h);
  const kes = ctx.keskinlik;
  const cx = w / 2, cy = h / 2;
  const step = Math.max(2, Math.floor(side * p.adimOrani));
  const cands: Pencere[] = [];
  const nS = p.ornek;
  for (let y = 0; y + side <= h; y += step)
    for (let x = 0; x + side <= w; x += step) {
      if (boxSum(I, w, x, y, x + side, y + side) < side * side * 0.995) continue;
      let k = 0, s = 0, n = 0;
      for (let j = 0; j < nS; j++)
        for (let i = 0; i < nS; i++) {
          const rx = x + ((i + 0.5) * side) / nS, ry = y + ((j + 0.5) * side) / nS;
          const [ax, ay] = applyH(ctx.H, rx, ry);
          const ix = Math.max(0, Math.min(har.kirisik.w - 1, Math.round(ax / har.olcek))), iy = Math.max(0, Math.min(har.kirisik.h - 1, Math.round(ay / har.olcek)));
          k += har.kirisik.d[iy * har.kirisik.w + ix];
          if (kes) {
            const bx = Math.max(0, Math.min(kes.map.w - 1, Math.floor(ax / kes.blokAn))), by = Math.max(0, Math.min(kes.map.h - 1, Math.floor(ay / kes.blokAn)));
            s += kes.map.d[by * kes.map.w + bx];
          }
          n++;
        }
      cands.push({ x, y, side, puan: 0, kirisik: k / n, keskinlik: s / n });
    }
  if (!cands.length) {
    // Adım çok kaba kaldıysa en büyük kareyi dene.
    const sq = largestSquare(rmask);
    if (sq.side < 8) return null;
    return { x: sq.x, y: sq.y, side: Math.min(side, sq.side), puan: 0, kirisik: 1, keskinlik: 0 };
  }
  // z-puanları
  const z = (get: (c: Pencere) => number) => {
    let m = 0, m2 = 0;
    for (const c of cands) { const v = get(c); m += v; m2 += v * v; }
    m /= cands.length;
    const sd = Math.sqrt(Math.max(1e-9, m2 / cands.length - m * m));
    return (c: Pencere) => (get(c) - m) / sd;
  };
  const zk = z((c) => c.kirisik), zs = z((c) => Math.log1p(c.keskinlik));
  const wk = har.dokuMu ? 0 : agirlik.kirisik;
  for (const c of cands) {
    const dx = (c.x + c.side / 2 - cx) / w, dy = (c.y + c.side / 2 - cy) / h;
    c.puan = -wk * zk(c) + agirlik.keskinlik * zs(c) - p.merkezCezasi * Math.hypot(dx, dy) * 4;
  }
  cands.sort((a, b) => b.puan - a.puan);
  return cands[0];
}

export function duzBolgeLog(ctx: Ctx, har: BolgeHaritalari, pen: Pencere, kaynak: string) {
  ctx.olcumler.kirisik_cv = +har.kirisikCV.toFixed(3);
  log(ctx, {
    adim: 'duz_bolge',
    risk: 'guvenli',
    durum: 'uygulandi',
    not: har.dokuMu ? 'Kabartma/dalgalı doku tüm kumaşta tutarlı: kırışıklık ölçütü kapatıldı, en net bölge seçildi' : `Kırışıklığı en az, en net bölge seçildi (${kaynak})`,
    olcum: { x: pen.x, y: pen.y, kenar: pen.side, kirisik_goreli: +pen.kirisik.toFixed(2), keskinlik: +pen.keskinlik.toFixed(1), kirisik_cv: +har.kirisikCV.toFixed(3), doku_mu: har.dokuMu },
  });
}
