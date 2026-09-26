// Render: kararlaştırılmış geometri (H + kırpım) tam çözünürlük kaynaktan TEK geçişte örneklenir
// (Catmull-Rom bikübik; küçültmede önce Lanczos ön-ölçekleme, büyütmede yerel ölçekte örnekleyip
// sonra Lanczos). Aynı geçişte GLOBAL piksel işlemleri (ışık kazanç alanı, beyaz dengesi) doğrusal
// ışıkta uygulanır. Hem "ham" (hizalı orijinal; sadakat denetimi için) hem "işlenmiş" kırpım döner.

import sharp from 'sharp';
import { isikKazanci } from './isik';
import { applyH, IDENTITY, type Ctx } from './tip';

export type RenderSonuc = { w: number; h: number; ham: Uint8Array; islenmis: Uint8Array };

const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
const SRGB = new Uint8Array(4096);
for (let i = 0; i < 4096; i++) { const l = i / 4095; const c = l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055; SRGB[i] = Math.round(Math.max(0, Math.min(1, c)) * 255); }
const toSrgb = (l: number) => SRGB[l <= 0 ? 0 : l >= 1 ? 4095 : Math.round(l * 4095)];

function cubic(t: number) {
  // Catmull-Rom (B=0, C=0.5)
  const a = Math.abs(t);
  if (a < 1) return 1.5 * a * a * a - 2.5 * a * a + 1;
  if (a < 2) return -0.5 * a * a * a + 2.5 * a * a - 4 * a + 2;
  return 0;
}

export async function renderKirpim(
  ctx: Ctx,
  kirpim: { x: number; y: number; side: number },
  T: number,
  ops: { isik: boolean; wb: boolean }
): Promise<RenderSonuc> {
  const { an } = ctx;
  const o = an.olcek;
  // Hızlı yol: geometri kimlikse eksen paralel kırpım doğrudan libvips Lanczos3 ile ölçeklenir
  // (büyütmede de Lanczos; adım 8 ≤ 2× denetler), piksel işlemleri ayrıca uygulanır.
  if (ctx.H.every((v, i) => v === IDENTITY[i])) {
    const left = Math.max(0, Math.round(kirpim.x * o)), top = Math.max(0, Math.round(kirpim.y * o));
    const side = Math.min(Math.round(kirpim.side * o), an.kaynak.w - left, an.kaynak.h - top);
    const reg = await an.oku(left, top, side, side, T / side);
    const ham = reg.d as Uint8Array;
    const isl = new Uint8Array(ham.length);
    const gains = ctx.wb && ops.wb ? ctx.wb : [1, 1, 1];
    const alan = ops.isik ? ctx.isikAlani : null;
    const step = kirpim.side / reg.w;
    for (let v = 0; v < reg.h; v++) {
      const ay = kirpim.y + (v + 0.5) * step;
      for (let u = 0; u < reg.w; u++) {
        const k = (v * reg.w + u) * 3;
        const gain = alan ? isikKazanci(alan, kirpim.x + (u + 0.5) * step, ay) : 1;
        isl[k] = toSrgb(LIN[ham[k]] * gain * gains[0]);
        isl[k + 1] = toSrgb(LIN[ham[k + 1]] * gain * gains[1]);
        isl[k + 2] = toSrgb(LIN[ham[k + 2]] * gain * gains[2]);
      }
    }
    return { w: reg.w, h: reg.h, ham, islenmis: isl };
  }
  const corners: [number, number][] = [
    [kirpim.x, kirpim.y], [kirpim.x + kirpim.side, kirpim.y], [kirpim.x, kirpim.y + kirpim.side], [kirpim.x + kirpim.side, kirpim.y + kirpim.side],
  ];
  const src = corners.map(([x, y]) => { const [ax, ay] = applyH(ctx.H, x, y); return [ax * o, ay * o]; });
  const pad = 4;
  let left = Math.floor(Math.min(...src.map((s) => s[0]))) - pad, top = Math.floor(Math.min(...src.map((s) => s[1]))) - pad;
  let right = Math.ceil(Math.max(...src.map((s) => s[0]))) + pad, bottom = Math.ceil(Math.max(...src.map((s) => s[1]))) + pad;
  left = Math.max(0, left); top = Math.max(0, top); right = Math.min(an.kaynak.w, right); bottom = Math.min(an.kaynak.h, bottom);
  const kaynakKenar = kirpim.side * o;
  // Küçültmede kaynak bölgeyi çıktı ölçeğine yakın ön-ölçekle (Lanczos, örtüşme önlenir).
  const f = T < kaynakKenar ? T / kaynakKenar : 1;
  const reg = await an.oku(left, top, right - left, bottom - top, f);
  const Tr = f < 1 ? T : Math.max(1, Math.round(kaynakKenar)); // büyütmede yerel ölçekte örnekle
  const ham = new Uint8Array(Tr * Tr * 3), isl = new Uint8Array(Tr * Tr * 3);
  const gains = ctx.wb && ops.wb ? ctx.wb : [1, 1, 1];
  const alan = ops.isik ? ctx.isikAlani : null;
  const rw = reg.w, rh = reg.h, rd = reg.d;
  const sample = (px: number, py: number, out: number[]) => {
    const x0 = Math.floor(px), y0 = Math.floor(py);
    const fx = px - x0, fy = py - y0;
    const wx = [cubic(fx + 1), cubic(fx), cubic(1 - fx), cubic(2 - fx)], wy = [cubic(fy + 1), cubic(fy), cubic(1 - fy), cubic(2 - fy)];
    let r = 0, g = 0, b = 0, ws = 0;
    for (let j = 0; j < 4; j++) {
      const yy = Math.max(0, Math.min(rh - 1, y0 - 1 + j));
      for (let i = 0; i < 4; i++) {
        const xx = Math.max(0, Math.min(rw - 1, x0 - 1 + i));
        const wgt = wx[i] * wy[j];
        const k = (yy * rw + xx) * 3;
        r += rd[k] * wgt; g += rd[k + 1] * wgt; b += rd[k + 2] * wgt; ws += wgt;
      }
    }
    out[0] = r / ws; out[1] = g / ws; out[2] = b / ws;
  };
  const px = [0, 0, 0];
  const step = kirpim.side / Tr;
  for (let v = 0; v < Tr; v++) {
    const ry = kirpim.y + (v + 0.5) * step;
    for (let u = 0; u < Tr; u++) {
      const rx = kirpim.x + (u + 0.5) * step;
      const [ax, ay] = applyH(ctx.H, rx, ry);
      sample((ax * o - left) * f - 0.5, (ay * o - top) * f - 0.5, px);
      const k = (v * Tr + u) * 3;
      const r = Math.max(0, Math.min(255, Math.round(px[0]))), g = Math.max(0, Math.min(255, Math.round(px[1]))), b = Math.max(0, Math.min(255, Math.round(px[2])));
      ham[k] = r; ham[k + 1] = g; ham[k + 2] = b;
      const gain = alan ? isikKazanci(alan, ax, ay) : 1;
      isl[k] = toSrgb(LIN[r] * gain * gains[0]);
      isl[k + 1] = toSrgb(LIN[g] * gain * gains[1]);
      isl[k + 2] = toSrgb(LIN[b] * gain * gains[2]);
    }
  }
  if (Tr === T) return { w: T, h: T, ham, islenmis: isl };
  // Büyütme: Lanczos3 (≤ 2×; adım 8 denetler).
  const up = async (d: Uint8Array) => (await sharp(Buffer.from(d.buffer, d.byteOffset, d.byteLength), { raw: { width: Tr, height: Tr, channels: 3 } }).resize(T, T, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer()) as unknown as Uint8Array;
  return { w: T, h: T, ham: await up(ham), islenmis: await up(isl) };
}

/** Sınırlı unsharp mask (adım 6) — sharp ile, tek doğrusal kazanç. */
export async function keskinlestir(d: Uint8Array, w: number, h: number, doz: number, sigma = 1): Promise<Uint8Array> {
  if (doz <= 0) return d;
  return (await sharp(Buffer.from(d.buffer, d.byteOffset, d.byteLength), { raw: { width: w, height: h, channels: 3 } })
    .sharpen({ sigma, m1: doz, m2: doz, x1: 0, y2: 255, y3: 255 })
    .raw()
    .toBuffer()) as unknown as Uint8Array;
}

/**
 * Tam kare (Fırat 2026-09-26: "orijinal boyutunu bozmadan düzenleme"): yükleyicinin verdiği kadraj ve
 * piksel boyutu aynen korunur; kırpma, döndürme, yakınlaştırma yok. Yalnız global ışık ve beyaz dengesi.
 */
export async function renderTamKare(ctx: Ctx, ops: { isik: boolean; wb: boolean }): Promise<RenderSonuc> {
  const { an } = ctx;
  const o = an.olcek;
  const reg = await an.oku(0, 0, an.kaynak.w, an.kaynak.h, 1);
  const ham = reg.d as Uint8Array;
  const isl = new Uint8Array(ham.length);
  const gains = ctx.wb && ops.wb ? ctx.wb : [1, 1, 1];
  const alan = ops.isik ? ctx.isikAlani : null;
  for (let v = 0; v < reg.h; v++) {
    const ay = (v + 0.5) / o;
    for (let u = 0; u < reg.w; u++) {
      const k = (v * reg.w + u) * 3;
      const gain = alan ? isikKazanci(alan, (u + 0.5) / o, ay) : 1;
      isl[k] = toSrgb(LIN[ham[k]] * gain * gains[0]);
      isl[k + 1] = toSrgb(LIN[ham[k + 1]] * gain * gains[1]);
      isl[k + 2] = toSrgb(LIN[ham[k + 2]] * gain * gains[2]);
    }
  }
  return { w: reg.w, h: reg.h, ham, islenmis: isl };
}
