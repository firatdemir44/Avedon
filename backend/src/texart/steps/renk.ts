// Renk uzayı dönüşümleri (sRGB ↔ doğrusal ↔ Lab), ΔE2000 ve yaklaşık Türkçe renk adı.

const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
export const srgbToLinear = (v: number) => LIN[v < 0 ? 0 : v > 255 ? 255 : Math.round(v)];
export function linearToSrgb(l: number): number {
  if (l <= 0) return 0;
  if (l >= 1) return 255;
  const c = l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055;
  return c * 255;
}

/** sRGB (0..255) → CIE Lab (D65). */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  let x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  let y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  let z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const fi = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const x = fi(fx) * 0.95047, y = fi(fy), z = fi(fz) * 1.08883;
  const R = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const G = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const B = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return [linearToSrgb(R), linearToSrgb(G), linearToSrgb(B)];
}

/** CIEDE2000. */
export function deltaE2000(l1: [number, number, number], l2: [number, number, number]): number {
  const [L1, a1, b1] = l1, [L2, a2, b2] = l2;
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (a: number, b: number) => { if (a === 0 && b === 0) return 0; const v = Math.atan2(b, a) * deg; return v < 0 ? v + 360 : v; };
  const h1p = h(a1p, b1), h2p = h(a2p, b2);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lmp = (L1 + L2) / 2, Cmp = (C1p + C2p) / 2;
  let hmp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hmp += h1p + h2p < 360 ? 360 : -360;
    hmp /= 2;
  }
  const T = 1 - 0.17 * Math.cos((hmp - 30) * rad) + 0.24 * Math.cos(2 * hmp * rad) + 0.32 * Math.cos((3 * hmp + 6) * rad) - 0.2 * Math.cos((4 * hmp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hmp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lmp - 50) ** 2) / Math.sqrt(20 + (Lmp - 50) ** 2);
  const Sc = 1 + 0.045 * Cmp, Sh = 1 + 0.015 * Cmp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

export const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();

// Yaklaşık Türkçe renk adları (tekstil kullanımına yakın). Eşleşme ΔE2000 ile en yakın ad.
const NAMES: [string, string][] = [
  ['siyah', '#111111'], ['antrasit', '#2F3236'], ['füme', '#4B4F55'], ['koyu gri', '#5F6368'], ['gri', '#8A8D91'],
  ['açık gri', '#B8BBC0'], ['gri melanj', '#A3A4A6'], ['beyaz', '#F7F7F5'], ['kırık beyaz', '#EFECE4'], ['ekru', '#E9E2D0'],
  ['krem', '#F1E7CF'], ['bej', '#D8C6A5'], ['kum', '#C9B48C'], ['taş', '#B5AA98'], ['vizon', '#A08C78'],
  ['camel', '#B0803E'], ['taba', '#9A5B2A'], ['kahverengi', '#6B4423'], ['koyu kahve', '#4A2E1A'], ['haki', '#7B7A4C'],
  ['zeytin yeşili', '#6B6B2E'], ['yeşil', '#2F8F4E'], ['çimen yeşili', '#5FA83A'], ['koyu yeşil', '#1F5133'], ['nane yeşili', '#98D8B0'],
  ['su yeşili', '#A9DCCB'], ['turkuaz', '#2AA6A0'], ['petrol', '#1F5F6B'], ['mavi', '#2F62B8'], ['lacivert', '#1B2A55'],
  ['gece mavisi', '#14213D'], ['indigo', '#2B3A8F'], ['saks mavisi', '#3E6ED3'], ['açık mavi', '#9DBDE6'], ['bebek mavisi', '#B7D3F0'],
  ['gök mavisi', '#6FA8E6'], ['mor', '#6D3B9E'], ['lila', '#B79FD9'], ['mürdüm', '#5B2A4B'], ['fuşya', '#D42C8A'],
  ['pembe', '#E88DB7'], ['pudra', '#E7BFB2'], ['somon', '#F0967E'], ['şeftali', '#F5C09A'], ['kırmızı', '#C8202F'],
  ['bordo', '#6E1423'], ['vişne', '#8B1E3F'], ['kiremit', '#B1452C'], ['turuncu', '#E8702A'], ['hardal', '#C9A227'],
  ['sarı', '#F2D22E'], ['limon sarısı', '#F0EA6A'], ['altın', '#C9A45B'], ['bakır', '#B46F44'], ['gümüş', '#BFC3C7'],
  ['neon pembe', '#FF4FA3'], ['neon sarı', '#E4FF4F'], ['neon yeşil', '#7CFF4F'], ['neon turuncu', '#FF7A2E'],
];
const NAMED = NAMES.map(([ad, hex]) => ({ ad, lab: rgbToLab(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)) }));

export function colorName(r: number, g: number, b: number): string {
  const lab = rgbToLab(r, g, b);
  let best = NAMED[0], bd = Infinity;
  for (const n of NAMED) {
    const d = deltaE2000(lab, n.lab);
    if (d < bd) { bd = d; best = n; }
  }
  return best.ad;
}
