// Adım 4 — Beyaz dengesi (Dikkat). Tek GLOBAL dönüşüm: doğrusal RGB'de üç kanal kazancı.
// Nötr referans seçimi (renkli ya da düşük kromalı ama GERÇEK tonlu kumaşı — haki, bej, krem —
// "griye çekmemek" için; Fırat 2026-09-26):
//   1) Kumaş dışında parlak ve düşük kromalı bir yüzey (kartela başlığı, etiket kâğıdı, beyaz masa)
//      yeterince genişse → o yüzey nötr referanstır (gray-world, patlamış pikseller hariç). Kumaşın
//      kendi rengi hesaba girmez.
//   2) Yoksa kumaşın kendisi ancak kroması düşük VE tonu sıcak/zeytin (haki–bej–krem) kuşağında
//      DEĞİLSE nötr referans sayılır (gray-world + white-patch p99 karışımı). Sıcak kuşaktaki düşük
//      kromalı kumaş gerçek renk olabilir: referans alınmaz.
//   3) Yoksa kumaş dışı zeminin tamamı düşük kromalıysa → zemin gray-world.
//   4) Güvenilir referans yoksa: kumaş kroması düşükse en fazla küçük doz (±%3) gray-world, değilse
//      atlanır (hafif renk kayması kabul edilir; TEXART.md §1).
// Doz: kazançlar 1'den en fazla ±%12 sapar; kumaş ortalama renginin öngörülen ΔE2000 kayması 6'yı
// aşarsa kazançlar o oranda kısılır.

import { deltaE2000, linearToSrgb, rgbToLab, srgbToLinear } from './renk';
import { log, type Ctx } from './tip';

export type BeyazParams = {
  kumasKromaMax: number; // kumaş Lab kroması bunun altındaysa (ve tonu sıcak kuşakta değilse) kumaş nötr referans
  sicakTon: [number, number]; // Lab ton açısı (derece) bu aralıktaysa kumaş "sıcak/zeytin": nötr sayılmaz
  beyazRefL: number; // beyaz referans için en az L
  beyazRefKroma: number; // beyaz referans için en çok kroma
  beyazRefEnAzOran: number; // beyaz referans piksel payı (kadrajın oranı) en az
  zeminKromaMax: number; // zemin kroması bunun altındaysa zemin nötr referans
  zeminEnAzOran: number; // zemin piksel payı (kadrajın oranı)
  karisim: number; // gray-world ağırlığı (kalanı white-patch)
  doz: number; // kazanç sapma sınırı (±)
  guvensizDoz: number; // güvenilir referans yokken kazanç sapma sınırı (±)
  enCokDE: number; // kumaş ortalama renginde izin verilen ΔE2000
  beyazYuzeyEnCokDE: number; // beyaz yüzey referansında kumaş ΔE2000 sınırı (kâğıt optik beyazlatıcıyla mavimsi olabilir; temkinli)
};

export const BEYAZ: BeyazParams = {
  kumasKromaMax: 6,
  sicakTon: [35, 125],
  beyazRefL: 75,
  beyazRefKroma: 10,
  beyazRefEnAzOran: 0.01,
  zeminKromaMax: 8,
  zeminEnAzOran: 0.05,
  karisim: 0.6,
  doz: 0.12,
  guvensizDoz: 0.03,
  enCokDE: 6,
  beyazYuzeyEnCokDE: 3,
};

export type BeyazReferans = 'beyaz_yuzey' | 'kumas' | 'zemin' | 'yok';

/** Lab ton açısı (0..360°). */
const tonAcisi = (a: number, b: number) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;

export function beyaz(ctx: Ctx, p: BeyazParams = BEYAZ) {
  const { img } = ctx.an;
  const seg = ctx.seg!;
  const n = img.w * img.h;
  const step = Math.max(1, Math.floor(n / 60_000));
  // Seçilen piksellerin doğrusal RGB ortalaması + p99 (white-patch).
  const acc = (sel: (i: number) => boolean) => {
    let r = 0, g = 0, b = 0, c = 0;
    const rs: number[] = [], gs: number[] = [], bs: number[] = [];
    for (let i = 0; i < n; i += step) {
      if (!sel(i)) continue;
      const R = srgbToLinear(img.d[i * 3]), G = srgbToLinear(img.d[i * 3 + 1]), B = srgbToLinear(img.d[i * 3 + 2]);
      r += R; g += G; b += B; c++;
      rs.push(R); gs.push(G); bs.push(B);
    }
    if (!c) return null;
    const q = (a: number[]) => { a.sort((x, y) => x - y); return a[Math.floor(0.99 * (a.length - 1))]; };
    return { mean: [r / c, g / c, b / c], p99: [q(rs), q(gs), q(bs)], c, oran: (c * step) / n };
  };
  const kumas = acc((i) => !!seg.mask.d[i]);
  if (!kumas) { log(ctx, { adim: 'beyaz_dengesi', risk: 'dikkat', durum: 'atlandi', not: 'Kumaş pikseli yok' }); return; }
  const kumasSrgb = kumas.mean.map(linearToSrgb) as [number, number, number];
  const kumasLab = rgbToLab(...kumasSrgb);
  const kumasKroma = Math.hypot(kumasLab[1], kumasLab[2]);
  const kumasTon = tonAcisi(kumasLab[1], kumasLab[2]);
  const sicak = kumasTon >= p.sicakTon[0] && kumasTon <= p.sicakTon[1];
  const gw = (m: number[]) => { const l = (m[0] + m[1] + m[2]) / 3; return [l / m[0], l / m[1], l / m[2]]; };

  // 1) Kumaş dışı beyaz/açık nötr yüzey (kart, etiket kâğıdı, masa); patlamış pikseller hariç.
  const beyazRef = seg.alanOrani < 1 - p.beyazRefEnAzOran
    ? acc((i) => {
        if (seg.mask.d[i]) return false;
        const r = img.d[i * 3], g = img.d[i * 3 + 1], b = img.d[i * 3 + 2];
        if (r >= 250 || g >= 250 || b >= 250) return false;
        const [l, a, bb] = rgbToLab(r, g, b);
        return l >= p.beyazRefL && Math.hypot(a, bb) <= p.beyazRefKroma;
      })
    : null;
  let referans: BeyazReferans;
  let gains: [number, number, number];
  let dozSinir = p.doz;
  const olcumOrtak: Record<string, number | string | boolean | null> = {
    kumas_kroma: +kumasKroma.toFixed(1),
    kumas_ton: Math.round(kumasTon),
    beyaz_yuzey_oran: beyazRef ? +beyazRef.oran.toFixed(3) : 0,
  };
  if (beyazRef && beyazRef.oran >= p.beyazRefEnAzOran) {
    referans = 'beyaz_yuzey';
    gains = gw(beyazRef.mean) as [number, number, number];
  } else if (kumasKroma <= p.kumasKromaMax && !sicak) {
    referans = 'kumas';
    const g1 = gw(kumas.mean), g2 = gw(kumas.p99);
    gains = [0, 1, 2].map((i) => p.karisim * g1[i] + (1 - p.karisim) * g2[i]) as [number, number, number];
  } else {
    const zemin = seg.zemin && seg.alanOrani < 1 - p.zeminEnAzOran ? acc((i) => !!seg.sinir.d[i]) : null;
    const zeminLab = zemin ? rgbToLab(...(zemin.mean.map(linearToSrgb) as [number, number, number])) : null;
    const zeminKroma = zeminLab ? Math.hypot(zeminLab[1], zeminLab[2]) : Infinity;
    olcumOrtak.zemin_kroma = Number.isFinite(zeminKroma) ? +zeminKroma.toFixed(1) : null;
    if (zemin && zeminKroma <= p.zeminKromaMax) {
      referans = 'zemin';
      gains = gw(zemin.mean) as [number, number, number];
    } else if (kumasKroma <= 8) {
      // Güvenilir referans yok; kumaş düşük kromalı ama tonu gerçek olabilir (haki/bej/krem): yalnız küçük doz.
      referans = 'yok';
      dozSinir = p.guvensizDoz;
      gains = gw(kumas.mean) as [number, number, number];
    } else {
      log(ctx, {
        adim: 'beyaz_dengesi',
        risk: 'dikkat',
        durum: 'atlandi',
        not: 'Nötr referans yok (kumaş renkli, nötr yüzey görünmüyor); renk olduğu gibi bırakıldı',
        olcum: { referans: 'yok', ...olcumOrtak },
      });
      return;
    }
  }
  // Yeşil kazancı 1'e normalize et (parlaklık korunur), dozla sınırla.
  gains = gains.map((g) => g / gains[1]) as [number, number, number];
  const sinirla = (g: number) => Math.max(1 - dozSinir, Math.min(1 + dozSinir, g));
  gains = gains.map(sinirla) as [number, number, number];
  // Öngörülen kumaş rengi kayması.
  const after = (k: number) => rgbToLab(...(kumas!.mean.map((v, i) => linearToSrgb(v * (1 + k * (gains[i] - 1)))) as [number, number, number]));
  let k = 1;
  let dE = deltaE2000(kumasLab, after(1));
  const dESinir = referans === 'beyaz_yuzey' ? p.beyazYuzeyEnCokDE : p.enCokDE;
  if (dE > dESinir) { k = dESinir / dE; dE = deltaE2000(kumasLab, after(k)); }
  gains = gains.map((g) => 1 + k * (g - 1)) as [number, number, number];
  const sapma = Math.max(...gains.map((g) => Math.abs(g - 1)));
  if (sapma < 0.005) {
    log(ctx, { adim: 'beyaz_dengesi', risk: 'dikkat', durum: 'atlandi', not: 'Renk zaten nötr', olcum: { referans, ...olcumOrtak } });
    return;
  }
  const sonLab = after(1);
  const sonKroma = Math.hypot(sonLab[1], sonLab[2]);
  ctx.wb = gains;
  ctx.olcumler.beyaz_dengesi_dE = +dE.toFixed(2);
  ctx.olcumler.beyaz_dengesi_referans = referans;
  const refAd = { beyaz_yuzey: 'kumaş dışı beyaz yüzey', kumas: 'kumaş (nötr)', zemin: 'zemin', yok: 'referans yok, küçük doz' }[referans];
  log(ctx, {
    adim: 'beyaz_dengesi',
    risk: 'dikkat',
    durum: 'uygulandi',
    doz: +sapma.toFixed(3),
    not: `Global kazançlar (${refAd}): R ${gains[0].toFixed(3)} · G ${gains[1].toFixed(3)} · B ${gains[2].toFixed(3)}`,
    olcum: {
      referans,
      ...olcumOrtak,
      kazanc_r: +gains[0].toFixed(3),
      kazanc_b: +gains[2].toFixed(3),
      ongorulen_dE: +dE.toFixed(2),
      kumas_kroma_sonra: +sonKroma.toFixed(1),
      kumas_ton_sonra: Math.round(tonAcisi(sonLab[1], sonLab[2])),
    },
  });
}
