// Adım 7 — Ölçek normalizasyonu (Dikkat, DENEYSEL). Kumaşın en net bölgesinden tam çözünürlük
// 256×256 kırpımın güç spektrumu radyal profile indirgenir; 4–64 px arasında belirgin bir tepe
// (yerel tabanın ≥ tepeOrani katı) varsa doku periyodu budur. Katalog kırpımının kenarı, çıktıda
// periyot ≈ hedefPeriyot px görünecek şekilde seçilir; ancak varsayılan (kumaşı dolduran) kırpımın
// [enKucukOran, 1] katı aralığına ve 2× büyütme sınırına sıkıştırılır. Tepe yoksa standart kırpım.
// Periyot ölçümü (dokuPeriyodu) adım 10 (kenar doldurma) tarafından da kullanılır.

import { luma, powerSpectrum } from './goruntu';
import { applyH, log, type Ctx } from './tip';

export type OlcekParams = {
  n: number; // FFT boyutu (2^k)
  minPeriyot: number; // px
  maxPeriyot: number; // px
  tepeOrani: number; // tepe / yerel taban
  hedefPeriyot: number; // çıktıda (896 px içerik) periyot px
  enKucukOran: number; // kırpım kenarı varsayılanın en az bu katı
  icerik: number; // katalog içerik alanı (px)
  enAzKaynak: number; // kırpım kaynak kenarı en az (2× sınırı)
};

export const OLCEK: OlcekParams = { n: 256, minPeriyot: 4, maxPeriyot: 64, tepeOrani: 4, hedefPeriyot: 12, enKucukOran: 0.5, icerik: 896, enAzKaynak: 448 };

export type OlcekSonuc = { side: number; kaynak: 'fft' | 'standart'; periyot: number | null };

/** Kaynakta (ax, ay) analiz koordinatı çevresinden n×n kırpım alıp radyal güç spektrumunda doku periyodunu ölçer (px, kaynak ölçeği). */
export async function dokuPeriyodu(ctx: Ctx, ax: number, ay: number, p: OlcekParams = OLCEK): Promise<{ periyot: number | null; tepe: number }> {
  const { an } = ctx;
  const n = p.n;
  if (an.kaynak.w < n || an.kaynak.h < n) return { periyot: null, tepe: 0 };
  const sx = Math.round(ax * an.olcek), sy = Math.round(ay * an.olcek);
  const left = Math.max(0, Math.min(an.kaynak.w - n, sx - n / 2)), top = Math.max(0, Math.min(an.kaynak.h - n, sy - n / 2));
  const reg = await an.oku(left, top, n, n);
  const P = powerSpectrum(luma(reg));
  // Radyal profil.
  const rmax = n / 2;
  const prof = new Float64Array(rmax), cnt = new Float64Array(rmax);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const r = Math.round(Math.hypot(x - rmax, y - rmax));
      if (r >= 1 && r < rmax) { prof[r] += P.d[y * n + x]; cnt[r]++; }
    }
  for (let r = 1; r < rmax; r++) prof[r] = cnt[r] ? prof[r] / cnt[r] : 0;
  // Frekans r ↔ periyot n/r. Yerel taban: ±%30 komşuluk medyanı.
  const rLo = Math.max(2, Math.ceil(n / p.maxPeriyot)), rHi = Math.min(rmax - 1, Math.floor(n / p.minPeriyot));
  let best = -1, bestRatio = 0;
  for (let r = rLo; r <= rHi; r++) {
    const a = Math.max(1, Math.floor(r * 0.7)), b = Math.min(rmax - 1, Math.ceil(r * 1.3));
    const nb: number[] = [];
    for (let k = a; k <= b; k++) if (Math.abs(k - r) > 1) nb.push(prof[k]);
    nb.sort((x, y) => x - y);
    const taban = nb[Math.floor(nb.length / 2)] || 1e-9;
    const ratio = prof[r] / taban;
    if (ratio > bestRatio) { bestRatio = ratio; best = r; }
  }
  const periyot = best > 0 && bestRatio >= p.tepeOrani ? +(n / best).toFixed(1) : null;
  return { periyot, tepe: bestRatio };
}

/** Rektifiye penceresinin merkezinden kaynakta n×n kırpım alıp periyot ölçer; yeni kırpım kenarını (analiz px) döner. */
export async function olcek(ctx: Ctx, varsayilan: { x: number; y: number; side: number }, p: OlcekParams = OLCEK): Promise<OlcekSonuc> {
  const { an } = ctx;
  const [ax, ay] = applyH(ctx.H, varsayilan.x + varsayilan.side / 2, varsayilan.y + varsayilan.side / 2);
  const kaynakKenar = varsayilan.side * an.olcek;
  const standart = (not: string, periyot: number | null, ek: Record<string, number | string | boolean | null> = {}) => {
    ctx.olcumler.olcek_kaynagi = 'standart';
    log(ctx, { adim: 'olcek', risk: 'dikkat', durum: 'atlandi', not, olcum: { periyot_px: periyot, ...ek } });
    return { side: varsayilan.side, kaynak: 'standart' as const, periyot };
  };
  if (an.kaynak.w < p.n || an.kaynak.h < p.n) return standart('Kaynak FFT penceresinden küçük; standart kırpım', null);
  const { periyot, tepe: bestRatio } = await dokuPeriyodu(ctx, ax, ay, p);
  if (periyot === null) return standart('Belirgin doku periyodu yok (düz/dokusuz ya da düzensiz); standart kırpım', null, { tepe_orani: +bestRatio.toFixed(1) });
  // Hedef: periyot çıktıda hedefPeriyot px → kaynak kırpım kenarı = periyot × icerik / hedef.
  let kaynakYeni = (periyot * p.icerik) / p.hedefPeriyot;
  const alt = Math.max(p.enAzKaynak, kaynakKenar * p.enKucukOran), ust = kaynakKenar;
  const sikistirildi = kaynakYeni < alt || kaynakYeni > ust;
  kaynakYeni = Math.max(alt, Math.min(ust, kaynakYeni));
  const side = Math.floor(kaynakYeni / an.olcek);
  ctx.olcumler.olcek_kaynagi = 'fft';
  ctx.olcumler.doku_periyodu_px = periyot;
  log(ctx, {
    adim: 'olcek',
    risk: 'dikkat',
    durum: 'uygulandi',
    doz: +(side / varsayilan.side).toFixed(2),
    not: `Doku periyodu ${periyot} px (tepe ${bestRatio.toFixed(1)}×); kırpım kenarı varsayılanın ${(side / varsayilan.side).toFixed(2)} katı${sikistirildi ? ' (sınıra sıkıştırıldı)' : ''} — DENEYSEL`,
    olcum: { periyot_px: periyot, tepe_orani: +bestRatio.toFixed(1), kaynak_kenar: Math.round(kaynakYeni), sikistirildi },
  });
  return { side, kaynak: 'fft', periyot };
}
