// Adım 1 — Kumaşı ayırma (Güvenli). Klasik yöntem, yalnızca piksel SEÇER; hiçbir piksel üretmez.
//  1) Lab renk kümeleme (k-ortalama; L ağırlığı düşük ki gölgelenme kumaşı bölmesin)
//  2) Kadraj merkezinde ağırlıklı kümeler kumaş, kenar şeridine sıkışmış kümeler zemin/etiket
//  3) Gölge büyütme: kumaş maskesi, keskin kenarla AYRILMAMIŞ ve renk (a,b) açısından kumaşa yakın
//     komşu piksellere yayılır (kırışık gölgesi yumuşak geçişlidir; etiket/kart/başka kumaş keskin
//     kenarla biter ve dışarıda kalır)
//  4) Aç/kapa, merkeze en yakın büyük bağlı bileşen, küçük delikleri (baskı motifi) doldurma
// Güven puanı: kumaş/zemin renk ayrımı + parça bütünlüğü + kadraj payı.

import { components, fillHoles, gauss, kmeans3, morph, type Mask } from './goruntu';
import { deltaE2000, rgbToLab } from './renk';
import { log, type Ctx, type Segmentation } from './tip';

export type AyirmaParams = {
  kume: number; // k-ortalama küme sayısı
  lAgirlik: number; // L kanalı ağırlığı (a,b = 1.4)
  merkezOrani: number; // merkez penceresi (kadrajın oranı)
  merkezEsigi: number; // kümenin kumaş sayılması için merkezdeki payı
  kenarOrani: number; // kenar şeridi kalınlığı (kadrajın oranı)
  buyutmeGradyan: number; // gölge büyütmesini durduran kenar gradyanı (L/px, gauss σ=3)
  buyutmeRenk: number; // gölge büyütmesi için en fazla (a,b) uzaklığı
  delikOrani: number; // doldurulacak en büyük delik (maske alanının oranı)
  doluEsigi: number; // maske kadrajın bu kadarını kaplıyorsa "kadraj dolu"
  guvenlikPayi: number; // son maske bu kadar (kısa kenar oranı) aşındırılır: kırpım kumaş kenarından uzak dursun
};

export const AYIRMA: AyirmaParams = {
  kume: 6,
  lAgirlik: 0.6,
  merkezOrani: 0.4,
  merkezEsigi: 0.03,
  kenarOrani: 0.06,
  buyutmeGradyan: 2.5,
  buyutmeRenk: 9,
  delikOrani: 0.05,
  doluEsigi: 0.9,
  guvenlikPayi: 0.015,
};

export function ayirma(ctx: Ctx, p: AyirmaParams = AYIRMA): Segmentation {
  const { img, L } = ctx.an;
  const { w, h } = img;
  const n = w * h;
  // 1) Lab; küçük örneklemde kümeleme, sonra tüm piksellere atama.
  const step = Math.max(1, Math.floor(Math.sqrt(n / 40_000)));
  const pts: number[] = [];
  const lab = new Float32Array(n * 3);
  const WL = p.lAgirlik, WC = 1.4;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const [l, a, b] = rgbToLab(img.d[i * 3], img.d[i * 3 + 1], img.d[i * 3 + 2]);
      lab[i * 3] = l; lab[i * 3 + 1] = a; lab[i * 3 + 2] = b;
      if (x % step === 0 && y % step === 0) pts.push(l * WL, a * WC, b * WC);
    }
  const { centers } = kmeans3(Float32Array.from(pts), p.kume);
  const labels = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0, bd = Infinity;
    const l = lab[i * 3] * WL, a = lab[i * 3 + 1] * WC, b = lab[i * 3 + 2] * WC;
    for (let c = 0; c < centers.length; c++) {
      const d = (l - centers[c][0]) ** 2 + (a - centers[c][1]) ** 2 + (b - centers[c][2]) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    labels[i] = best;
  }
  // 2) Merkez / kenar histogramları → kumaş kümeleri.
  const cx0 = Math.floor((w * (1 - p.merkezOrani)) / 2), cx1 = w - cx0, cy0 = Math.floor((h * (1 - p.merkezOrani)) / 2), cy1 = h - cy0;
  const kx = Math.max(2, Math.floor(w * p.kenarOrani)), ky = Math.max(2, Math.floor(h * p.kenarOrani));
  const merkez = new Array(centers.length).fill(0), kenar = new Array(centers.length).fill(0);
  let nm = 0, nk = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const l = labels[y * w + x];
      if (x >= cx0 && x < cx1 && y >= cy0 && y < cy1) (merkez[l]++, nm++);
      if (x < kx || x >= w - kx || y < ky || y >= h - ky) (kenar[l]++, nk++);
    }
  const kumas = centers.map((_, c) => merkez[c] / nm >= p.merkezEsigi && !(kenar[c] / nk > 3 * (merkez[c] / nm) && merkez[c] / nm < 0.15));
  if (!kumas.some(Boolean)) kumas[merkez.indexOf(Math.max(...merkez))] = true;
  const unscale = (c: number[]): [number, number, number] => [c[0] / WL, c[1] / WC, c[2] / WC];
  const kumasLab = centers.filter((_, c) => kumas[c]).map(unscale);
  // Kenara sıkışmış ve rengi kumaştan ayrışan kümeler zemin/etikettir: gölge büyütmesi buraya girmez.
  const zeminKume = centers.map((c, i) => {
    if (kumas[i]) return false;
    const kenarBaskin = kenar[i] / nk > 3 * (merkez[i] / nm);
    const u = unscale(c);
    const uzak = Math.min(...kumasLab.map((k) => Math.hypot(u[1] - k[1], u[2] - k[2]))) > 4;
    return kenarBaskin && uzak;
  });

  // 3) Gölge büyütme: keskin kenar yoksa ve renk yakınsa komşuya yayıl.
  const mask: Mask = { w, h, d: new Uint8Array(n) };
  for (let i = 0; i < n; i++) mask.d[i] = kumas[labels[i]] ? 1 : 0;
  // İki ölçekte kenar: ince (σ=1.5, keskin etiket/kart kenarı) ve kaba (σ=3, yumuşak ama belirgin sınır).
  const Ls = gauss(L, 3), Lf = gauss(L, 1.5);
  const grad = new Float32Array(n), gradF = new Float32Array(n);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      grad[i] = Math.hypot(Ls.d[i + 1] - Ls.d[i - 1], Ls.d[i + w] - Ls.d[i - w]) * 0.5;
      gradF[i] = Math.hypot(Lf.d[i + 1] - Lf.d[i - 1], Lf.d[i + w] - Lf.d[i - w]) * 0.5;
    }
  const renkYakin = (i: number) => {
    const a = lab[i * 3 + 1], b = lab[i * 3 + 2];
    for (const k of kumasLab) if (Math.hypot(a - k[1], b - k[2]) <= p.buyutmeRenk) return true;
    return false;
  };
  const queue = new Int32Array(n);
  let qh = 0, qt = 0;
  for (let i = 0; i < n; i++) if (mask.d[i]) queue[qt++] = i;
  let buyutulen = 0;
  while (qh < qt) {
    const i = queue[qh++];
    const x = i % w;
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i + w < n ? i + w : -1];
    for (const j of nb) {
      if (j < 0 || mask.d[j]) continue;
      if (!zeminKume[labels[j]] && grad[j] < p.buyutmeGradyan && gradF[j] < p.buyutmeGradyan * 1.6 && renkYakin(j)) { mask.d[j] = 1; queue[qt++] = j; buyutulen++; }
    }
  }
  // 4) Kapa (çizgi/motif gibi ince ayrımları köprüle) + aç (kıymık temizliği) → merkeze en yakın büyük bileşen → delik doldurma.
  const r = Math.max(1, Math.round(Math.min(w, h) / 200));
  let m = morph(morph(mask, r, false), r, true);
  m = morph(morph(m, r, true), r, false);
  const { labels: cc, areas } = components(m);
  const hit = new Array(areas.length).fill(0);
  for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) hit[cc[y * w + x]]++;
  hit[0] = 0;
  let bestC = 0;
  for (let c = 1; c < areas.length; c++) if (hit[c] * Math.sqrt(areas[c]) > hit[bestC] * Math.sqrt(areas[bestC] ?? 0)) bestC = c;
  if (!bestC && areas.length > 1) bestC = areas.indexOf(Math.max(...areas.slice(1)));
  const toplamKumas = areas.reduce((s, v, i) => (i ? s + v : s), 0);
  for (let i = 0; i < n; i++) m.d[i] = cc[i] === bestC ? 1 : 0;
  const alan = areas[bestC] ?? 0;
  m = fillHoles(m, alan * p.delikOrani);
  const pay = Math.round(Math.min(w, h) * p.guvenlikPayi);
  if (pay > 0) m = morph(m, pay, true);
  let alanSon = 0;
  for (let i = 0; i < n; i++) alanSon += m.d[i];
  const alanOrani = alanSon / n;

  // 5) Zemin (kumaş dışı) baskın rengi.
  const disi = new Array(centers.length).fill(0);
  const sinir: Mask = { w, h, d: new Uint8Array(n) };
  let nd = 0;
  for (let i = 0; i < n; i++) if (!m.d[i]) { disi[labels[i]]++; nd++; sinir.d[i] = 1; }
  let zemin: Segmentation['zemin'] = null;
  if (nd / n > 0.03) {
    const zc = disi.indexOf(Math.max(...disi));
    zemin = { lab: unscale(centers[zc]), oran: disi[zc] / nd };
  }
  // 6) Güven.
  let ayrim = 30;
  if (zemin) ayrim = Math.min(...kumasLab.map((k) => deltaE2000(k, zemin!.lab)));
  const ayrimPuan = Math.max(0, Math.min(1, (ayrim - 4) / 14));
  const butunluk = toplamKumas ? alan / toplamKumas : 0;
  const kadrajDolu = alanOrani >= p.doluEsigi;
  const guven = Math.round(100 * (kadrajDolu ? 0.85 : 0.5 * ayrimPuan + 0.3 * butunluk + 0.2 * Math.min(1, alanOrani / 0.5))) / 100;
  const seg: Segmentation = { mask: m, guven, kadrajDolu, alanOrani, zemin, kumasLab, yariSaydam: false, sinir };
  log(ctx, {
    adim: 'ayirma',
    risk: 'guvenli',
    durum: 'uygulandi',
    not: kadrajDolu ? 'Kumaş kadrajı dolduruyor' : `Kumaş kadrajın %${Math.round(alanOrani * 100)}'ini kaplıyor; dışı (zemin/etiket/başka parça) dışlandı`,
    olcum: {
      alan_orani: +alanOrani.toFixed(3),
      guven,
      kume_sayisi: kumasLab.length,
      golge_buyutme_orani: +(buyutulen / n).toFixed(3),
      zemin_ayrimi_dE: zemin ? +ayrim.toFixed(1) : null,
    },
  });
  return seg;
}
