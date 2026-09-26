// Adım 4 — Beyaz dengesi (Dikkat). Tek GLOBAL dönüşüm: doğrusal RGB'de üç kanal kazancı.
// Nötr referans seçimi (renkli kumaşı "griye çekmemek" için):
//   1) Kumaşın kendisi düşük kromalıysa (beyaz/gri/ekru/siyah) → kumaş üzerinde gray-world +
//      white-patch (p99) karışımı.
//   2) Değilse kumaş dışı zemin (masa, karton, kâğıt) düşük kromalıysa → zemin üzerinde gray-world.
//   3) Nötr referans yoksa atlanır (hafif renk kayması kabul edilir; TEXART.md §1).
// Doz: kazançlar 1'den en fazla ±%12 sapar; kumaş ortalama renginin öngörülen ΔE2000 kayması 6'yı
// aşarsa kazançlar o oranda kısılır.

import { deltaE2000, linearToSrgb, rgbToLab, srgbToLinear } from './renk';
import { log, type Ctx } from './tip';

export type BeyazParams = {
  kumasKromaMax: number; // kumaş Lab kroması bunun altındaysa kumaş nötr referans
  zeminKromaMax: number; // zemin kroması bunun altındaysa zemin nötr referans
  zeminEnAzOran: number; // zemin piksel payı (kadrajın oranı)
  karisim: number; // gray-world ağırlığı (kalanı white-patch)
  doz: number; // kazanç sapma sınırı (±)
  enCokDE: number; // kumaş ortalama renginde izin verilen ΔE2000
};

export const BEYAZ: BeyazParams = { kumasKromaMax: 8, zeminKromaMax: 8, zeminEnAzOran: 0.05, karisim: 0.6, doz: 0.12, enCokDE: 6 };

export function beyaz(ctx: Ctx, p: BeyazParams = BEYAZ) {
  const { img } = ctx.an;
  const seg = ctx.seg!;
  const n = img.w * img.h;
  // Kumaş ve zemin ortalamaları (doğrusal RGB) + p99 (white-patch).
  const acc = (sel: Uint8Array) => {
    let r = 0, g = 0, b = 0, c = 0;
    const rs: number[] = [], gs: number[] = [], bs: number[] = [];
    const step = Math.max(1, Math.floor(n / 60_000));
    for (let i = 0; i < n; i += step) {
      if (!sel[i]) continue;
      const R = srgbToLinear(img.d[i * 3]), G = srgbToLinear(img.d[i * 3 + 1]), B = srgbToLinear(img.d[i * 3 + 2]);
      r += R; g += G; b += B; c++;
      rs.push(R); gs.push(G); bs.push(B);
    }
    if (!c) return null;
    const q = (a: number[]) => { a.sort((x, y) => x - y); return a[Math.floor(0.99 * (a.length - 1))]; };
    return { mean: [r / c, g / c, b / c], p99: [q(rs), q(gs), q(bs)], c };
  };
  const kumas = acc(seg.mask.d);
  if (!kumas) { log(ctx, { adim: 'beyaz_dengesi', risk: 'dikkat', durum: 'atlandi', not: 'Kumaş pikseli yok' }); return; }
  const kumasSrgb = kumas.mean.map(linearToSrgb) as [number, number, number];
  const kumasLab = rgbToLab(...kumasSrgb);
  const kumasKroma = Math.hypot(kumasLab[1], kumasLab[2]);
  let referans: string;
  let gains: [number, number, number];
  const gw = (m: number[]) => { const l = (m[0] + m[1] + m[2]) / 3; return [l / m[0], l / m[1], l / m[2]]; };
  if (kumasKroma <= p.kumasKromaMax) {
    referans = 'kumas';
    const g1 = gw(kumas.mean), g2 = gw(kumas.p99);
    gains = [0, 1, 2].map((i) => p.karisim * g1[i] + (1 - p.karisim) * g2[i]) as [number, number, number];
  } else {
    const zemin = seg.zemin && seg.alanOrani < 1 - p.zeminEnAzOran ? acc(seg.sinir.d) : null;
    const zeminLab = zemin ? rgbToLab(...(zemin.mean.map(linearToSrgb) as [number, number, number])) : null;
    const zeminKroma = zeminLab ? Math.hypot(zeminLab[1], zeminLab[2]) : Infinity;
    if (zemin && zeminKroma <= p.zeminKromaMax) {
      referans = 'zemin';
      gains = gw(zemin.mean) as [number, number, number];
    } else {
      log(ctx, {
        adim: 'beyaz_dengesi',
        risk: 'dikkat',
        durum: 'atlandi',
        not: 'Nötr referans yok (kumaş renkli, nötr zemin görünmüyor); renk olduğu gibi bırakıldı',
        olcum: { kumas_kroma: +kumasKroma.toFixed(1), zemin_kroma: Number.isFinite(zeminKroma) ? +zeminKroma.toFixed(1) : null },
      });
      return;
    }
  }
  // Yeşil kazancı 1'e normalize et (parlaklık korunur), dozla sınırla.
  gains = gains.map((g) => g / gains[1]) as [number, number, number];
  const sinirla = (g: number) => Math.max(1 - p.doz, Math.min(1 + p.doz, g));
  gains = gains.map(sinirla) as [number, number, number];
  // Öngörülen kumaş rengi kayması.
  const after = (k: number) => rgbToLab(...(kumas!.mean.map((v, i) => linearToSrgb(v * (1 + k * (gains[i] - 1)))) as [number, number, number]));
  let k = 1;
  let dE = deltaE2000(kumasLab, after(1));
  if (dE > p.enCokDE) { k = p.enCokDE / dE; dE = deltaE2000(kumasLab, after(k)); }
  gains = gains.map((g) => 1 + k * (g - 1)) as [number, number, number];
  const sapma = Math.max(...gains.map((g) => Math.abs(g - 1)));
  if (sapma < 0.005) {
    log(ctx, { adim: 'beyaz_dengesi', risk: 'dikkat', durum: 'atlandi', not: 'Renk zaten nötr', olcum: { referans, kumas_kroma: +kumasKroma.toFixed(1) } });
    return;
  }
  ctx.wb = gains;
  ctx.olcumler.beyaz_dengesi_dE = +dE.toFixed(2);
  log(ctx, {
    adim: 'beyaz_dengesi',
    risk: 'dikkat',
    durum: 'uygulandi',
    doz: +sapma.toFixed(3),
    not: `Global kazançlar (${referans} referanslı): R ${gains[0].toFixed(3)} · G ${gains[1].toFixed(3)} · B ${gains[2].toFixed(3)}`,
    olcum: { referans, kumas_kroma: +kumasKroma.toFixed(1), kazanc_r: +gains[0].toFixed(3), kazanc_b: +gains[2].toFixed(3), ongorulen_dE: +dE.toFixed(2) },
  });
}
