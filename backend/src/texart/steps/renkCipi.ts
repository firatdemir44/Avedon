// Renk çipi (TEXART.md §5.3): işlenmiş katalog kırpımından baskın renk(ler). Lab'da k-ortalama,
// yakın kümeler (ΔE2000 < 10) birleştirilir; ilk küme payı ≥ %70 ise tek renk, değilse (baskılı /
// çok renkli) pay ≥ %8 olan ilk 3 renk. HEX + yaklaşık Türkçe ad + pay.

import sharp from 'sharp';
import { kmeans3 } from './goruntu';
import { colorName, deltaE2000, labToRgb, rgbToLab, toHex } from './renk';

export type ColorChip = { hex: string; ad: string; oran: number };

export function renkler(d: Uint8Array, w: number, h: number): ColorChip[] {
  const step = Math.max(1, Math.floor((w * h) / 16_000));
  const pts: number[] = [];
  for (let i = 0; i < w * h; i += step) {
    const [L, a, b] = rgbToLab(d[i * 3], d[i * 3 + 1], d[i * 3 + 2]);
    pts.push(L, a, b);
  }
  const { centers, labels } = kmeans3(Float32Array.from(pts), 5, 10, 3);
  const counts = centers.map(() => 0);
  for (const l of labels) counts[l]++;
  // Birleştir.
  type K = { lab: [number, number, number]; n: number };
  const ks: K[] = centers.map((c, i) => ({ lab: c as [number, number, number], n: counts[i] })).filter((k) => k.n > 0).sort((a, b) => b.n - a.n);
  const merged: K[] = [];
  for (const k of ks) {
    const m = merged.find((x) => deltaE2000(x.lab, k.lab) < 10);
    if (m) {
      const t = m.n + k.n;
      m.lab = [0, 1, 2].map((i) => (m.lab[i] * m.n + k.lab[i] * k.n) / t) as [number, number, number];
      m.n = t;
    } else merged.push({ lab: [...k.lab] as [number, number, number], n: k.n });
  }
  merged.sort((a, b) => b.n - a.n);
  const total = merged.reduce((s, k) => s + k.n, 0);
  const chips = merged.map((k) => {
    const [r, g, b] = labToRgb(...k.lab);
    return { hex: toHex(r, g, b), ad: colorName(r, g, b), oran: +(k.n / total).toFixed(3) };
  });
  if (chips[0].oran >= 0.7) return [chips[0]];
  return chips.filter((c) => c.oran >= 0.08).slice(0, 3);
}

export async function cipGorseli(chips: ColorChip[], size = 256): Promise<Buffer> {
  const hexRgb = (hex: string) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) });
  if (chips.length === 1) return sharp({ create: { width: size, height: size, channels: 3, background: hexRgb(chips[0].hex) } }).png().toBuffer();
  const total = chips.reduce((s, c) => s + c.oran, 0);
  const parts: { input: Buffer; left: number; top: number }[] = [];
  let x = 0;
  for (let i = 0; i < chips.length; i++) {
    const w = i === chips.length - 1 ? size - x : Math.max(1, Math.round((size * chips[i].oran) / total));
    parts.push({ input: await sharp({ create: { width: w, height: size, channels: 3, background: hexRgb(chips[i].hex) } }).png().toBuffer(), left: x, top: 0 });
    x += w;
  }
  return sharp({ create: { width: size, height: size, channels: 3, background: '#000' } }).composite(parts).png().toBuffer();
}
