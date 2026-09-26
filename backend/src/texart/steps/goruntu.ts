// Saf TS görüntü matematiği (texart adımları için). Düzlem = tek kanal Float32 matris.
// Hiçbir işlev üretken değildir: yalnızca ölçer, süzer, etiketler.

export type Plane = { w: number; h: number; d: Float32Array };
export type Mask = { w: number; h: number; d: Uint8Array };
export type RGB = { w: number; h: number; d: Uint8Array | Buffer }; // 3 kanal, satır satır

export const plane = (w: number, h: number, fill = 0): Plane => {
  const d = new Float32Array(w * h);
  if (fill) d.fill(fill);
  return { w, h, d };
};

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** RGB (0..255) → parlaklık düzlemi (0..255, Rec.601 ağırlıkları). */
export function luma(img: RGB): Plane {
  const p = plane(img.w, img.h);
  const s = img.d;
  for (let i = 0, j = 0; i < p.d.length; i++, j += 3) p.d[i] = 0.299 * s[j] + 0.587 * s[j + 1] + 0.114 * s[j + 2];
  return p;
}

/** Ayrılabilir Gauss bulanıklığı (kenarlar yansıtılır). */
export function gauss(p: Plane, sigma: number): Plane {
  if (sigma <= 0) return { w: p.w, h: p.h, d: Float32Array.from(p.d) };
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const { w, h } = p;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        let xx = x + i;
        if (xx < 0) xx = -xx;
        if (xx >= w) xx = 2 * w - xx - 2;
        acc += p.d[row + clamp(xx, 0, w - 1)] * k[i + r];
      }
      tmp[row + x] = acc;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        let yy = y + i;
        if (yy < 0) yy = -yy;
        if (yy >= h) yy = 2 * h - yy - 2;
        acc += tmp[clamp(yy, 0, h - 1) * w + x] * k[i + r];
      }
      out[y * w + x] = acc;
    }
  }
  return { w, h, d: out };
}

/** 2× küçültme (2×2 ortalama). */
export function half(p: Plane): Plane {
  const w = Math.floor(p.w / 2), h = Math.floor(p.h / 2);
  const o = plane(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = 2 * y * p.w + 2 * x;
      o.d[y * w + x] = 0.25 * (p.d[i] + p.d[i + 1] + p.d[i + p.w] + p.d[i + p.w + 1]);
    }
  return o;
}

/** Laplace varyansı (bulanıklık ölçüsü; 4 komşulu Laplace). */
export function laplacianVariance(p: Plane, mask?: Mask): number {
  const { w, h, d } = p;
  let n = 0, s = 0, s2 = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mask && !mask.d[i]) continue;
      const v = 4 * d[i] - d[i - 1] - d[i + 1] - d[i - w] - d[i + w];
      n++;
      s += v;
      s2 += v * v;
    }
  if (n < 16) return 0;
  const m = s / n;
  return s2 / n - m * m;
}

/** Sobel gradyan büyüklüğü ve yapı tensörü bileşenleri (Jxx, Jyy, Jxy toplamları). */
export function structureTensor(p: Plane, mask?: Mask) {
  const { w, h, d } = p;
  let jxx = 0, jyy = 0, jxy = 0, n = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mask && !mask.d[i]) continue;
      const gx = d[i + 1 - w] + 2 * d[i + 1] + d[i + 1 + w] - d[i - 1 - w] - 2 * d[i - 1] - d[i - 1 + w];
      const gy = d[i + w - 1] + 2 * d[i + w] + d[i + w + 1] - d[i - w - 1] - 2 * d[i - w] - d[i - w + 1];
      jxx += gx * gx;
      jyy += gy * gy;
      jxy += gx * gy;
      n++;
    }
  if (!n) return { angle: 0, coherence: 0, energy: 0 };
  // Baskın gradyan yönü; doku çizgileri buna diktir.
  const angle = 0.5 * Math.atan2(2 * jxy, jxx - jyy);
  const tr = jxx + jyy;
  const det = Math.sqrt((jxx - jyy) ** 2 + 4 * jxy * jxy);
  const coherence = tr > 0 ? det / tr : 0;
  return { angle, coherence, energy: tr / n };
}

/** Bağlı bileşen etiketleme (4 komşu). Döner: etiket dizisi (0 = arka plan) ve bileşen alanları. */
export function components(m: Mask): { labels: Int32Array; areas: number[] } {
  const { w, h, d } = m;
  const labels = new Int32Array(w * h);
  const areas: number[] = [0];
  const stack = new Int32Array(w * h);
  let next = 1;
  for (let i0 = 0; i0 < d.length; i0++) {
    if (!d[i0] || labels[i0]) continue;
    let sp = 0, area = 0;
    stack[sp++] = i0;
    labels[i0] = next;
    while (sp) {
      const i = stack[--sp];
      area++;
      const x = i % w;
      if (x > 0 && d[i - 1] && !labels[i - 1]) (labels[i - 1] = next), (stack[sp++] = i - 1);
      if (x < w - 1 && d[i + 1] && !labels[i + 1]) (labels[i + 1] = next), (stack[sp++] = i + 1);
      if (i >= w && d[i - w] && !labels[i - w]) (labels[i - w] = next), (stack[sp++] = i - w);
      if (i + w < d.length && d[i + w] && !labels[i + w]) (labels[i + w] = next), (stack[sp++] = i + w);
    }
    areas.push(area);
    next++;
  }
  return { labels, areas };
}

/** Kare çekirdekle aşındırma (erode=true) / genişletme. */
export function morph(m: Mask, r: number, erode: boolean): Mask {
  const { w, h, d } = m;
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = erode ? 1 : 0;
      for (let i = -r; i <= r; i++) {
        const xx = clamp(x + i, 0, w - 1);
        const q = d[y * w + xx];
        if (erode ? !q : q) { v = erode ? 0 : 1; break; }
      }
      tmp[y * w + x] = v;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = erode ? 1 : 0;
      for (let i = -r; i <= r; i++) {
        const yy = clamp(y + i, 0, h - 1);
        const q = tmp[yy * w + x];
        if (erode ? !q : q) { v = erode ? 0 : 1; break; }
      }
      out[y * w + x] = v;
    }
  return { w, h, d: out };
}

/** Çerçeveye değmeyen ve alanı sınırın altındaki boşlukları doldurur (baskı motifleri, küçük etiket parçaları). */
export function fillHoles(m: Mask, maxArea: number): Mask {
  const inv: Mask = { w: m.w, h: m.h, d: m.d.map((v) => (v ? 0 : 1)) };
  const { labels, areas } = components(inv);
  const touches = new Uint8Array(areas.length);
  for (let x = 0; x < m.w; x++) (touches[labels[x]] = 1), (touches[labels[(m.h - 1) * m.w + x]] = 1);
  for (let y = 0; y < m.h; y++) (touches[labels[y * m.w]] = 1), (touches[labels[y * m.w + m.w - 1]] = 1);
  const out = Uint8Array.from(m.d);
  for (let i = 0; i < out.length; i++) {
    const l = labels[i];
    if (l && !touches[l] && areas[l] <= maxArea) out[i] = 1;
  }
  return { w: m.w, h: m.h, d: out };
}

/** İntegral görüntü (w+1)×(h+1). */
export function integral(src: ArrayLike<number>, w: number, h: number): Float64Array {
  const W = w + 1;
  const I = new Float64Array(W * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) {
      row += src[(y - 1) * w + (x - 1)];
      I[y * W + x] = I[(y - 1) * W + x] + row;
    }
  }
  return I;
}
export const boxSum = (I: Float64Array, w: number, x0: number, y0: number, x1: number, y1: number) => {
  const W = w + 1;
  return I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0];
};

/** Maske içinde en büyük eksen paralel kare (histogram yöntemi, O(w·h)). */
export function largestSquare(m: Mask): { x: number; y: number; side: number } {
  const { w, h, d } = m;
  const heights = new Int32Array(w);
  let best = { x: 0, y: 0, side: 0 };
  const stack: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) heights[x] = d[y * w + x] ? heights[x] + 1 : 0;
    stack.length = 0;
    for (let x = 0; x <= w; x++) {
      const hgt = x < w ? heights[x] : 0;
      while (stack.length && heights[stack[stack.length - 1]] >= hgt) {
        const top = stack.pop()!;
        const hh = heights[top];
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const width = x - left;
        const side = Math.min(hh, width);
        if (side > best.side) best = { x: left, y: y - hh + 1, side };
      }
      stack.push(x);
    }
  }
  // Kare, dikdörtgenin sol üstünde; ortalayalım.
  return best;
}

/** Yüzdelik (kopya üzerinde sıralayarak; örneklem alınır). */
export function percentile(vals: ArrayLike<number>, q: number, maxSamples = 200_000): number {
  const n = vals.length;
  if (!n) return 0;
  const step = Math.max(1, Math.floor(n / maxSamples));
  const arr: number[] = [];
  for (let i = 0; i < n; i += step) arr.push(vals[i]);
  arr.sort((a, b) => a - b);
  return arr[clamp(Math.round(q * (arr.length - 1)), 0, arr.length - 1)];
}

/** Basit k-ortalama (3 boyut). Döner: merkezler ve her noktanın etiketi. */
export function kmeans3(pts: Float32Array, k: number, iters = 12, seed = 7): { centers: number[][]; labels: Uint8Array } {
  const n = pts.length / 3;
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  // k-means++ başlangıcı
  const centers: number[][] = [];
  const first = Math.floor(rnd() * n);
  centers.push([pts[first * 3], pts[first * 3 + 1], pts[first * 3 + 2]]);
  const dist = new Float32Array(n).fill(Infinity);
  while (centers.length < k) {
    const c = centers[centers.length - 1];
    let total = 0;
    for (let i = 0; i < n; i++) {
      const d = (pts[i * 3] - c[0]) ** 2 + (pts[i * 3 + 1] - c[1]) ** 2 + (pts[i * 3 + 2] - c[2]) ** 2;
      if (d < dist[i]) dist[i] = d;
      total += dist[i];
    }
    let r = rnd() * total, idx = n - 1;
    for (let i = 0; i < n; i++) { r -= dist[i]; if (r <= 0) { idx = i; break; } }
    centers.push([pts[idx * 3], pts[idx * 3 + 1], pts[idx * 3 + 2]]);
  }
  const labels = new Uint8Array(n);
  for (let it = 0; it < iters; it++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = (pts[i * 3] - centers[c][0]) ** 2 + (pts[i * 3 + 1] - centers[c][1]) ** 2 + (pts[i * 3 + 2] - centers[c][2]) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
      labels[i] = best;
      const a = sum[best];
      a[0] += pts[i * 3]; a[1] += pts[i * 3 + 1]; a[2] += pts[i * 3 + 2]; a[3]++;
    }
    for (let c = 0; c < centers.length; c++) if (sum[c][3]) centers[c] = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]];
  }
  return { centers, labels };
}

/** Yerinde radix-2 FFT (uzunluk 2^k). */
function fft1(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Kare (2^k) düzlemin güç spektrumu |F|², DC ortada. Ortalama çıkarılır ve Hann penceresi uygulanır. */
export function powerSpectrum(p: Plane): Plane {
  const n = p.w;
  if (n !== p.h || (n & (n - 1)) !== 0) throw new Error('powerSpectrum: kare ve 2^k boyut gerekir');
  let mean = 0;
  for (let i = 0; i < p.d.length; i++) mean += p.d[i];
  mean /= p.d.length;
  const re = new Float64Array(n * n), im = new Float64Array(n * n);
  const win = new Float64Array(n);
  for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) re[y * n + x] = (p.d[y * n + x] - mean) * win[x] * win[y];
  const rr = new Float64Array(n), ri = new Float64Array(n);
  for (let y = 0; y < n; y++) {
    rr.set(re.subarray(y * n, y * n + n)); ri.set(im.subarray(y * n, y * n + n));
    fft1(rr, ri);
    re.set(rr, y * n); im.set(ri, y * n);
  }
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) { rr[y] = re[y * n + x]; ri[y] = im[y * n + x]; }
    fft1(rr, ri);
    for (let y = 0; y < n; y++) { re[y * n + x] = rr[y]; im[y * n + x] = ri[y]; }
  }
  const out = plane(n, n);
  const hn = n / 2;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const sx = (x + hn) % n, sy = (y + hn) % n;
      out.d[y * n + x] = re[sy * n + sx] ** 2 + im[sy * n + sx] ** 2;
    }
  return out;
}

/** Tek kanal SSIM (8×8 pencere, Gauss ağırlıksız; 0..255 ölçek). */
export function ssim(a: Plane, b: Plane, win = 8): number {
  const { w, h } = a;
  const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2;
  let total = 0, n = 0;
  for (let y = 0; y + win <= h; y += win)
    for (let x = 0; x + win <= w; x += win) {
      let ma = 0, mb = 0;
      for (let j = 0; j < win; j++) for (let i = 0; i < win; i++) { const k = (y + j) * w + x + i; ma += a.d[k]; mb += b.d[k]; }
      const N = win * win;
      ma /= N; mb /= N;
      let va = 0, vb = 0, cov = 0;
      for (let j = 0; j < win; j++) for (let i = 0; i < win; i++) { const k = (y + j) * w + x + i; const da = a.d[k] - ma, db = b.d[k] - mb; va += da * da; vb += db * db; cov += da * db; }
      va /= N - 1; vb /= N - 1; cov /= N - 1;
      total += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      n++;
    }
  return n ? total / n : 1;
}
