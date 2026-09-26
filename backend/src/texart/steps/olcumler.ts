// Sadakat ölçümleri (TEXART.md §4) — burada yalnızca ÖLÇÜLÜR; eşik/geri düşme mantığı KOMUT.md
// Adım 4'te eklenecek. Hizalı ham kırpım ile işlenmiş kırpım karşılaştırılır:
//   doku_ssim: parlaklık kanalında SSIM · dE2000_ort: ortalama ΔE2000 · dE2000_yerel_std: 8×8 parça
//   ortalama ΔE'lerinin standart sapması (bölgesel değişiklik yok → düşük).

import { half, luma, ssim, type Plane } from './goruntu';
import { deltaE2000, rgbToLab } from './renk';

export type Sadakat = { doku_ssim: number; dE2000_ort: number; dE2000_yerel_std: number };

export function sadakat(ham: Uint8Array, isl: Uint8Array, w: number, h: number): Sadakat {
  // Hız: ≤ 512 px'e indir.
  let a: Plane = luma({ w, h, d: ham }), b: Plane = luma({ w, h, d: isl });
  let f = 1;
  while (a.w > 512) { a = half(a); b = half(b); f *= 2; }
  const s = ssim(a, b);
  // ΔE: 8×8 parça, her parçadan örnek pikseller.
  const G = 8;
  const bw = Math.floor(w / G), bh = Math.floor(h / G);
  const parca: number[] = [];
  let toplam = 0, n = 0;
  const step = Math.max(1, Math.floor((bw * bh) / 400));
  for (let gy = 0; gy < G; gy++)
    for (let gx = 0; gx < G; gx++) {
      let ps = 0, pn = 0;
      for (let k = 0; k < bw * bh; k += step) {
        const x = gx * bw + (k % bw), y = gy * bh + Math.floor(k / bw);
        const i = (y * w + x) * 3;
        const d = deltaE2000(rgbToLab(ham[i], ham[i + 1], ham[i + 2]), rgbToLab(isl[i], isl[i + 1], isl[i + 2]));
        ps += d; pn++;
      }
      const m = pn ? ps / pn : 0;
      parca.push(m);
      toplam += ps; n += pn;
    }
  const ort = n ? toplam / n : 0;
  const pm = parca.reduce((s2, v) => s2 + v, 0) / parca.length;
  const std = Math.sqrt(parca.reduce((s2, v) => s2 + (v - pm) ** 2, 0) / parca.length);
  return { doku_ssim: +s.toFixed(4), dE2000_ort: +ort.toFixed(3), dE2000_yerel_std: +std.toFixed(3) };
}
