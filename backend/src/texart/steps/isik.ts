// Adım 3 — Işık dengeleme (Dikkat). Düşük frekanslı ışık eğimi ve köşe kararması çıkarılır:
// kumaş içi parlaklığın çok geniş (σ ≈ kısa kenarın %12'si) Gauss ortalaması "ışık alanı"dır;
// kazanç = medyan / alan, doz sınırlı (±%25). Alan yalnızca kumaş piksellerinden hesaplanır
// (normalize konvolüsyon), zemin/etiket sızmaz. Yapıyı değil gölgelemeyi düzeltir: melanj,
// yıkama efekti, jakar, baskı gibi tasarım özellikleri σ'nın çok altında kalır. Koruma: kumaşta
// düşük frekanslı RENK değişimi (degrade) varsa parlaklık eğimi de tasarım olabilir → doz kısılır.

import { gauss, half, percentile, plane, type Plane } from './goruntu';
import { rgbToLab } from './renk';
import { log, type Ctx } from './tip';

export type IsikParams = {
  sigmaOrani: number; // Gauss σ / kısa kenar
  doz: number; // en fazla kazanç sapması (±)
  enAzEgim: number; // alanın p95/p5 oranı bunun altındaysa düzeltme gereksiz
  kromaKoruma: [number, number]; // düşük frekanslı kroma std bu aralıkta dozu 1→0'a kısar
  kucultme: number; // alan bu çarpanla küçültülüp saklanır
};

export const ISIK: IsikParams = { sigmaOrani: 0.12, doz: 0.25, enAzEgim: 1.06, kromaKoruma: [3, 9], kucultme: 4 };

export function isik(ctx: Ctx, p: IsikParams = ISIK) {
  const { L, img } = ctx.an;
  const mask = ctx.seg!.mask;
  const { w, h } = L;
  const sigma = p.sigmaOrani * Math.min(w, h);
  // Normalize konvolüsyon: gauss(L·m) / gauss(m).
  const Lm = plane(w, h), M = plane(w, h), A = plane(w, h), B = plane(w, h);
  for (let i = 0; i < w * h; i++) {
    if (!mask.d[i]) continue;
    Lm.d[i] = L.d[i];
    M.d[i] = 1;
    const [, a, b] = rgbToLab(img.d[i * 3], img.d[i * 3 + 1], img.d[i * 3 + 2]);
    A.d[i] = a;
    B.d[i] = b;
  }
  // Hız: alanlar 4× küçültülüp öyle bulanıklaştırılır (σ da /4); ışık alanı zaten düşük frekanslı.
  const k = p.kucultme;
  const sh = (q: Plane) => { let r = q; for (let i = 1; i < k; i *= 2) r = half(r); return r; };
  const sLm = sh(Lm), sM = sh(M), sA = sh(A), sB = sh(B);
  const sg = sigma / k;
  const gL = gauss(sLm, sg), gM = gauss(sM, sg), gA = gauss(sA, sg), gB = gauss(sB, sg);
  const gw = gL.w, gh = gL.h;
  const field = plane(gw, gh);
  const vals: number[] = [];
  let ca = 0, cb = 0, ca2 = 0, cb2 = 0, n = 0;
  for (let i = 0; i < gw * gh; i++) {
    const m = gM.d[i];
    field.d[i] = m > 1e-3 ? gL.d[i] / m : 0;
    if (sM.d[i] > 0.5) {
      vals.push(field.d[i]);
      const a = gA.d[i] / m, b = gB.d[i] / m;
      ca += a; cb += b; ca2 += a * a; cb2 += b * b; n++;
    }
  }
  const arr = Float32Array.from(vals);
  const med = percentile(arr, 0.5), p5 = percentile(arr, 0.05), p95 = percentile(arr, 0.95);
  const egim = p5 > 1 ? p95 / p5 : 1;
  const kromaStd = n ? Math.sqrt(Math.max(0, ca2 / n - (ca / n) ** 2) + Math.max(0, cb2 / n - (cb / n) ** 2)) : 0;
  const [k0, k1] = p.kromaKoruma;
  const koruma = Math.max(0, Math.min(1, 1 - (kromaStd - k0) / (k1 - k0)));
  const doz = +(p.doz * koruma).toFixed(3);
  const olcum = { egim_p95_p5: +egim.toFixed(3), medyan: +med.toFixed(1), kroma_lf_std: +kromaStd.toFixed(2), sigma: +sigma.toFixed(1) };
  if (egim < p.enAzEgim) {
    ctx.isikAlani = null;
    log(ctx, { adim: 'isik_dengeleme', risk: 'dikkat', durum: 'atlandi', not: 'Işık zaten dengeli', olcum });
    return;
  }
  if (doz <= 0.02) {
    ctx.isikAlani = null;
    log(ctx, { adim: 'isik_dengeleme', risk: 'dikkat', durum: 'atlandi', not: 'Kumaşta düşük frekanslı renk geçişi (degrade) var; parlaklık eğimi tasarım olabilir, dokunulmadı', olcum });
    return;
  }
  // Kazanç alanı: g = clamp(med / field, 1−doz, 1+doz); kumaş dışı 1.
  const gain = plane(gw, gh, 1);
  let uygulanan = 0;
  for (let i = 0; i < gw * gh; i++) {
    const f = field.d[i];
    if (f > 1) {
      const g = Math.max(1 - doz, Math.min(1 + doz, med / f));
      gain.d[i] = g;
      if (Math.abs(g - 1) > uygulanan) uygulanan = Math.abs(g - 1);
    }
  }
  ctx.isikAlani = { plane: gain, olcek: k };
  ctx.olcumler.isik_egimi = olcum.egim_p95_p5;
  log(ctx, {
    adim: 'isik_dengeleme',
    risk: 'dikkat',
    durum: 'uygulandi',
    doz,
    not: `Düşük frekanslı ışık alanı düzleştirildi (en fazla ±%${Math.round(uygulanan * 100)} kazanç)`,
    olcum: { ...olcum, en_cok_kazanc: +uygulanan.toFixed(3) },
  });
}

/** Analiz koordinatında kazanç (çift doğrusal). */
export function isikKazanci(alan: { plane: Plane; olcek: number } | null | undefined, ax: number, ay: number): number {
  if (!alan) return 1;
  const { plane: g, olcek } = alan;
  const fx = ax / olcek - 0.5, fy = ay / olcek - 0.5;
  const x0 = Math.max(0, Math.min(g.w - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(g.h - 1, Math.floor(fy)));
  const x1 = Math.min(g.w - 1, x0 + 1), y1 = Math.min(g.h - 1, y0 + 1);
  const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
  const a = g.d[y0 * g.w + x0], b = g.d[y0 * g.w + x1], c = g.d[y1 * g.w + x0], d = g.d[y1 * g.w + x1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}
