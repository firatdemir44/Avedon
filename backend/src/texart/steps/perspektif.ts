// Adım 2 — Açı / perspektif (Güvenli, yalnızca geometrik dönüşüm).
//  A) Kumaş parçasının dört kenarı kadrajda görünüyorsa (kartela, masaya serilmiş parça): maskenin
//     dört köşesinden homografi; hedef, kenar uzunluklarının ortalamasıyla kurulan dik dörtgen.
//  B) Kumaş kadrajı dolduruyorsa: baskın doku yönü (yapı tensörü). Yön eksene küçük bir açıyla
//     yatıksa (1°–12°) ve doku yönü tutarlıysa kadraj o kadar döndürülür (ilmek/çizgi dik dursun).
//  Emin olunmayan durumda atlanır ve not düşülür. Çıktı: H (rektifiye uzay → analiz kopyası) ve
//  rektifiye uzaydaki kumaş maskesi.

import { gauss, structureTensor, type Mask } from './goruntu';
import { applyH, invertH, log, type Ctx, type H3 } from './tip';

export type PerspektifParams = {
  kenarPayi: number; // köşe kadraj kenarına bundan yakınsa "kumaş kadrajda kesilmiş" (oran)
  alanToleransi: number; // dörtgen alanı / maske alanı bu aralığın dışındaysa dörtgen değil
  enAzSapma: number; // derece: bundan küçük açı zaten düz sayılır
  enCokSapma: number; // derece: bundan büyük açı güvenilmez, atlanır
  tutarlilikMin: number; // yapı tensörü tutarlılığı (0..1)
  enCokKenarOrani: number; // dörtgen için karşılıklı kenar oranı sınırı (perspektif aşırıysa atla)
};

export const PERSPEKTIF: PerspektifParams = { kenarPayi: 0.01, alanToleransi: 0.1, enAzSapma: 1, enCokSapma: 12, tutarlilikMin: 0.3, enCokKenarOrani: 1.6 };

/** 8×8 Gauss eliminasyonu ile 4 nokta homografisi (src → dst). */
export function homographyFromPoints(src: [number, number][], dst: [number, number][]): H3 {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let piv = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    const d = A[c][c] || 1e-12;
    for (let k = c; k < 9; k++) A[c][k] /= d;
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  return [A[0][8], A[1][8], A[2][8], A[3][8], A[4][8], A[5][8], A[6][8], A[7][8], 1];
}

/** Maskeyi H üzerinden rektifiye uzaya taşır (en yakın komşu). Rektifiye uzayın boyutu verilir. */
export function warpMask(mask: Mask, H: H3, w: number, h: number): Mask {
  const out: Mask = { w, h, d: new Uint8Array(w * h) };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [sx, sy] = applyH(H, x + 0.5, y + 0.5);
      const ix = Math.floor(sx), iy = Math.floor(sy);
      if (ix >= 0 && iy >= 0 && ix < mask.w && iy < mask.h) out.d[y * w + x] = mask.d[iy * mask.w + ix];
    }
  return out;
}

function quadArea(q: [number, number][]) {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % 4];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export function perspektif(ctx: Ctx, p: PerspektifParams = PERSPEKTIF) {
  const seg = ctx.seg!;
  const { mask } = seg;
  const { w, h } = mask;
  const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // A) Dört köşe (x+y, x−y, −x+y, −x−y uç noktaları).
  if (!seg.kadrajDolu) {
    const c: [number, number][] = [[Infinity, 0], [-Infinity, 0], [-Infinity, 0], [Infinity, 0]];
    let s: number[] = [Infinity, -Infinity, -Infinity, Infinity];
    let area = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!mask.d[y * w + x]) continue;
        area++;
        const a = x + y, b = x - y;
        if (a < s[0]) (s[0] = a), (c[0] = [x, y]); // sol üst
        if (b > s[1]) (s[1] = b), (c[1] = [x, y]); // sağ üst
        if (a > s[2]) (s[2] = a), (c[2] = [x, y]); // sağ alt
        if (b < s[3]) (s[3] = b), (c[3] = [x, y]); // sol alt
      }
    const pay = Math.max(2, Math.round(Math.min(w, h) * p.kenarPayi));
    const kesik = c.some(([x, y]) => x < pay || y < pay || x >= w - pay || y >= h - pay);
    const qa = quadArea(c);
    const oran = area ? qa / area : 0;
    const ust = dist(c[0], c[1]), alt = dist(c[3], c[2]), sol = dist(c[0], c[3]), sag = dist(c[1], c[2]);
    const W = (ust + alt) / 2, Hh = (sol + sag) / 2;
    const kenarOrani = Math.max(ust / alt, alt / ust, sol / sag, sag / sol);
    // Zaten dik mi? Köşe açıları 90°'ye yakın ve kenarlar eşitse geometri kimlik kalır.
    const angles = c.map((_, i) => {
      const a = c[(i + 3) % 4], b = c[i], d = c[(i + 1) % 4];
      const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [d[0] - b[0], d[1] - b[1]];
      return (Math.acos((v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1)) * 180) / Math.PI;
    });
    const sapma = Math.max(...angles.map((a) => Math.abs(a - 90)));
    const tilt = (Math.atan2(c[1][1] - c[0][1], c[1][0] - c[0][0]) * 180) / Math.PI;
    const olcum = { yontem: 'kenar', alan_orani: +oran.toFixed(2), aci_sapmasi: +sapma.toFixed(1), egim: +tilt.toFixed(1), kenar_orani: +kenarOrani.toFixed(2), kesik };
    if (!kesik && Math.abs(oran - 1) <= p.alanToleransi && kenarOrani <= p.enCokKenarOrani) {
      if (sapma < p.enAzSapma && Math.abs(tilt) < p.enAzSapma) {
        log(ctx, { adim: 'perspektif', risk: 'guvenli', durum: 'atlandi', not: 'Kumaş zaten dik duruyor', olcum });
        ctx.rmask = mask;
        return;
      }
      if (sapma <= 2 * p.enCokSapma && Math.abs(tilt) <= 3 * p.enCokSapma) {
        // Hedef dik dörtgen, kumaş merkezi sabit kalsın.
        const cx = (c[0][0] + c[1][0] + c[2][0] + c[3][0]) / 4, cy = (c[0][1] + c[1][1] + c[2][1] + c[3][1]) / 4;
        const dst: [number, number][] = [[cx - W / 2, cy - Hh / 2], [cx + W / 2, cy - Hh / 2], [cx + W / 2, cy + Hh / 2], [cx - W / 2, cy + Hh / 2]];
        // H: rektifiye (dst) → analiz (src).
        ctx.H = homographyFromPoints(dst, c);
        ctx.rmask = warpMask(mask, ctx.H, w, h);
        log(ctx, { adim: 'perspektif', risk: 'guvenli', durum: 'uygulandi', doz: +sapma.toFixed(1), not: 'Kumaş kenarlarından homografi; dik dörtgene getirildi', olcum });
        return;
      }
      log(ctx, { adim: 'perspektif', risk: 'guvenli', durum: 'atlandi', not: 'Açı sapması güven sınırının üstünde; geometri değiştirilmedi', olcum });
      ctx.rmask = mask;
      return;
    }
    // Dörtgen değil ya da kadrajda kesik → doku yönüne düş.
  }

  // B) Doku yönü: yapı tensörü (hafif yumuşatılmış L, maske içi).
  const Ls = gauss(ctx.an.L, 1);
  const st = structureTensor(Ls, mask);
  let deg = (st.angle * 180) / Math.PI; // baskın gradyan yönü
  // Eksene göre en yakın sapma (mod 90).
  deg = ((deg % 90) + 90) % 90;
  if (deg > 45) deg -= 90;
  const olcum = { yontem: 'doku_yonu', aci: +deg.toFixed(1), tutarlilik: +st.coherence.toFixed(2) };
  if (st.coherence >= p.tutarlilikMin && Math.abs(deg) >= p.enAzSapma && Math.abs(deg) <= p.enCokSapma) {
    const th = (deg * Math.PI) / 180;
    const cx = w / 2, cy = h / 2;
    // H: rektifiye → analiz = döndürme (merkez etrafında, +deg ile geri).
    const cos = Math.cos(th), sin = Math.sin(th);
    const H: H3 = [cos, -sin, cx - cos * cx + sin * cy, sin, cos, cy - sin * cx - cos * cy, 0, 0, 1];
    ctx.H = H;
    ctx.rmask = warpMask(mask, H, w, h);
    log(ctx, { adim: 'perspektif', risk: 'guvenli', durum: 'uygulandi', doz: +deg.toFixed(1), not: `Doku yönüne göre ${deg.toFixed(1)}° döndürüldü`, olcum });
    return;
  }
  ctx.rmask = mask;
  log(ctx, {
    adim: 'perspektif',
    risk: 'guvenli',
    durum: 'atlandi',
    not: st.coherence < p.tutarlilikMin ? 'Baskın doku yönü belirsiz; geometri değiştirilmedi' : Math.abs(deg) < p.enAzSapma ? 'Doku zaten eksene paralel' : 'Açı güven sınırının dışında; değiştirilmedi',
    olcum,
  });
}

/** Rektifiye uzaydaki bir noktanın analiz kopyasındaki karşılığı (yardımcı). */
export const toAnalysis = (ctx: Ctx, x: number, y: number) => applyH(ctx.H, x, y);
export const toRectified = (ctx: Ctx, x: number, y: number) => applyH(invertH(ctx.H), x, y);
