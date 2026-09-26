// Adım 10 — Kenar doldurma (Dikkat). Kumaş dışı alanlar (kartela başlığı/etiket, boş zemin, kenardaki
// başka nesneler) fotoğrafın KENDİ kumaş pikselleri KOPYALANARAK doldurulur; görsel boyutu ve kadraj
// değişmez. KIRMIZI ÇİZGİ (§1) uyarınca ÜRETKEN HİÇBİR ŞEY YOK: sinir ağı, difüzyon, inpainting,
// bulanık dolgu yok. Yöntem: görüntü kapitonesi (image quilting, Efros–Freeman) — kaynak bloklar
// maske içindeki temiz bölgeden 1:1 ölçekte (yeniden örnekleme yok, tam sayı ötelemeyle) kopyalanır;
// bloklar örtüşür, örtüşmede en küçük hatalı dikiş (dinamik programlama, dört kenarda) + 3 px
// yumuşatma. Bloklar bilinen kumaştan dışa doğru katman katman yerleştirilir (her bloğun bilinen
// komşusu olur). Aday seçiminde "devam" adayı (komşu bloğun kaynağını aynı ötelemeyle sürdürme) ve
// doku periyodu kadar kaydırılmış adaylar önce denenir; böylece örgü/çizgi tekrarı hizalı kalır.
// Planlama analiz ölçeğinde, kopyalama tam çözünürlükte.
// Maske iyileştirmesi (yalnız bu adım için, seçim işlemi): adım 1 maskesi bazen kartela kartını da
// kumaş sayar. Ana kumaş kromasından (maske bloklarının (a,b) modu) uzak, kumaş dışına/çerçeveye
// değen ve yeterince büyük (≥ maske alanının %1,5'i) bileşenler kumaş dışı sayılır (doldurulur);
// kumaşın içinde kalan ya da küçük farklı renkli bölgeler (baskı motifi) korunur ama kaynak olarak
// kullanılmaz. Çok renkli kumaşta (blokların > %35'i ana kromadan uzak) bu iyileştirme kapalıdır.
// Maske içindeki gerçek kumaş pikselleri BİT DÜZEYİNDE korunur; yalnız maske sınırından güvenlik payı
// kadar içeride dar bir geçiş bandı harmanlanır. Yapılmadığı durumlar: maske güveni düşük, yarı saydam
// kumaş, kumaş kadrajın %25'inden az, kaynak temiz kare küçük, dikiş hatası yüksek (desen raporu
// kaynaktan büyük → döşeme deseni yanlış gösterir).

import { boxSum, components, integral, largestSquare, morph, type Mask } from './goruntu';
import { dokuPeriyodu } from './olcek';
import { rgbToLab } from './renk';
import { log, type Ctx } from './tip';

export type DoldurmaParams = {
  enAzAlan: number; // kumaş / kadraj alan oranı bunun altındaysa doldurma yok
  enAzGuven: number; // maske güveni bunun altındaysa doldurma yok
  enAzKaynak: number; // en büyük temiz karenin kenarı (kaynak px) en az
  enAzPeriyotKati: number; // temiz kare en az bu kadar periyot içermeli
  blokPeriyotKati: number; // blok kenarı ≈ bu kadar periyot
  enAzBlok: number; // blok kenarı (kaynak px) en az
  enCokBlok: number; // blok kenarı en çok
  ortusme: number; // örtüşme / blok
  adaySayisi: number; // aday sayısı (blok başına; yarısı yakın, yarısı rastgele)
  yakinSigma: number; // yakın aday dağılımı σ (blok katı)
  mesafeCezasi: number; // hata × (1 + ceza × uzaklık/kısa kenar)
  payOrani: number; // güvenlik payı (analiz kısa kenarı oranı; en az 2 px)
  dikisEsigi: number; // normalize dikiş hatası (MSE / doku varyansı) bunu aşarsa atlanır
  yumusatma: number; // dikiş çevresinde geçiş genişliği (örtüşmenin oranı; en az 3 px)
  ihmalOrani: number; // doldurulacak alan kadrajın bu oranından azsa "yok" sayılır
  renkBlok: number; // maske iyileştirmesi blok boyu (analiz px)
  renkEsigi: number; // blok ort. (a,b) ana kumaştan bu kadar uzaksa kumaş dışı adayı
  cokRenkOrani: number; // maske bloklarının bu payı ana kromadan uzaksa "çok renkli": iyileştirme kapalı
  enAzCikarma: number; // çıkarılacak bileşen en az maske alanının bu oranı (küçük motifler kalır)
};

export const DOLDURMA: DoldurmaParams = {
  enAzAlan: 0.25,
  enAzGuven: 0.5,
  enAzKaynak: 128,
  enAzPeriyotKati: 2,
  blokPeriyotKati: 3,
  enAzBlok: 128,
  enCokBlok: 384,
  ortusme: 0.25,
  adaySayisi: 240,
  yakinSigma: 1,
  mesafeCezasi: 1.5,
  payOrani: 0.006,
  dikisEsigi: 0.6,
  yumusatma: 0.34,
  ihmalOrani: 0.002,
  renkBlok: 8,
  renkEsigi: 4.5,
  cokRenkOrani: 0.35,
  enAzCikarma: 0.015,
};

export type DoldurmaSonuc = { uygulandi: boolean; out: Uint8Array; neden?: string };

type Yerlesim = { gx: number; gy: number; dx: number; dy: number; sx: number; sy: number; hata: number; bilinen: number };

/** Maske iyileştirmesi: ana kumaş kromasından uzak, kumaş dışına/çerçeveye değen bloklar kumaş dışı. */
function renkIyilestirme(ctx: Ctx, p: DoldurmaParams): { kumas: Mask; kaynakUygun: Mask; cikarilanOran: number; cokRenkli: boolean } {
  const seg = ctx.seg!;
  const mask = seg.mask;
  const { w, h } = mask;
  const img = ctx.an.img.d;
  const b = p.renkBlok;
  const bw = Math.ceil(w / b), bh = Math.ceil(h / b);
  const A = new Float32Array(bw * bh), B = new Float32Array(bw * bh), N = new Float32Array(bw * bh);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask.d[i]) continue;
      const [, a, bb] = rgbToLab(img[i * 3], img[i * 3 + 1], img[i * 3 + 2]);
      const k = Math.floor(y / b) * bw + Math.floor(x / b);
      A[k] += a; B[k] += bb; N[k]++;
    }
  // Ana kumaş kroması: maske bloklarının (a,b) düzleminde en yoğun bölgesi (mod; kart/etiket azınlıkta kalır).
  const BIN = 2, R = 64, G = Math.ceil((2 * R) / BIN);
  const hist = new Float32Array(G * G);
  const bloklar: { a: number; b: number; n: number }[] = [];
  for (let k = 0; k < bw * bh; k++) {
    if (N[k] < (b * b) / 2) continue;
    const a = A[k] / N[k], bb = B[k] / N[k];
    bloklar.push({ a, b: bb, n: N[k] });
    const ia = Math.max(0, Math.min(G - 1, Math.floor((a + R) / BIN))), ib = Math.max(0, Math.min(G - 1, Math.floor((bb + R) / BIN)));
    hist[ib * G + ia] += N[k];
  }
  if (bloklar.length < 4) return { kumas: mask, kaynakUygun: mask, cikarilanOran: 0, cokRenkli: false };
  let enIyi = 0;
  for (let k = 1; k < hist.length; k++) if (hist[k] > hist[enIyi]) enIyi = k;
  const ma = ((enIyi % G) + 0.5) * BIN - R, mb = (Math.floor(enIyi / G) + 0.5) * BIN - R;
  let sa = 0, sb = 0, sn = 0;
  for (const q of bloklar) if (Math.hypot(q.a - ma, q.b - mb) <= p.renkEsigi) { sa += q.a * q.n; sb += q.b * q.n; sn += q.n; }
  const a0 = sn ? sa / sn : ma, b0 = sn ? sb / sn : mb;
  // Çok renkli (baskı/jakar/degrade): blokların belirgin payı ana kromadan uzaksa iyileştirme kapalı.
  let uzakSayi = 0;
  for (const q of bloklar) if (Math.hypot(q.a - a0, q.b - b0) > p.renkEsigi) uzakSayi++;
  const cokRenkli = uzakSayi / bloklar.length > p.cokRenkOrani;
  if (cokRenkli) return { kumas: mask, kaynakUygun: mask, cikarilanOran: 0, cokRenkli };
  // Uzak bloklar (piksel maskesi).
  const uzak: Mask = { w, h, d: new Uint8Array(w * h) };
  let uzakBlok = 0;
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      const k = by * bw + bx;
      if (N[k] < 1) continue;
      if (Math.hypot(A[k] / N[k] - a0, B[k] / N[k] - b0) <= p.renkEsigi) continue;
      uzakBlok++;
      for (let y = by * b; y < Math.min(h, (by + 1) * b); y++) for (let x = bx * b; x < Math.min(w, (bx + 1) * b); x++) if (mask.d[y * w + x]) uzak.d[y * w + x] = 1;
    }
  const kaynakUygun: Mask = { w, h, d: new Uint8Array(w * h) };
  for (let i = 0; i < w * h; i++) kaynakUygun.d[i] = mask.d[i] && !uzak.d[i] ? 1 : 0;
  if (!uzakBlok) return { kumas: mask, kaynakUygun, cikarilanOran: 0, cokRenkli };
  // Kumaş dışına (maske dışı, 1 px genişletilmiş) ya da çerçeveye değen uzak bileşenler → kumaş dışı.
  const dis: Mask = { w, h, d: new Uint8Array(w * h) };
  for (let i = 0; i < w * h; i++) dis.d[i] = mask.d[i] ? 0 : 1;
  const disG = morph(dis, 1, false);
  const { labels, areas } = components(uzak);
  const deger = new Uint8Array(areas.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const l = labels[y * w + x];
      if (!l) continue;
      if (disG.d[y * w + x] || x === 0 || y === 0 || x === w - 1 || y === h - 1) deger[l] = 1;
    }
  // Küçük bileşenler (baskı motifi, kenar yansıması) kumaş sayılmaya devam eder; yalnız büyük parçalar (kart) çıkar.
  let maskeAlan = 0;
  for (let i = 0; i < w * h; i++) maskeAlan += mask.d[i];
  for (let l = 1; l < areas.length; l++) if (areas[l] < maskeAlan * p.enAzCikarma) deger[l] = 0;
  const kumas: Mask = { w, h, d: new Uint8Array(w * h) };
  let cikarilan = 0;
  for (let i = 0; i < w * h; i++) {
    const l = labels[i];
    if (mask.d[i] && !(l && deger[l])) kumas.d[i] = 1;
    else if (mask.d[i]) cikarilan++;
  }
  // Küçük kıymıklar temizlenir; merkeze en yakın büyük bileşen kalır.
  const r = Math.max(1, Math.round(Math.min(w, h) / 300));
  let m = morph(morph(kumas, r, true), r, false);
  const cc = components(m);
  const hit = new Array(cc.areas.length).fill(0);
  for (let y = Math.floor(h * 0.3); y < Math.ceil(h * 0.7); y++) for (let x = Math.floor(w * 0.3); x < Math.ceil(w * 0.7); x++) hit[cc.labels[y * w + x]]++;
  hit[0] = 0;
  let best = 0;
  for (let c = 1; c < cc.areas.length; c++) if (hit[c] * Math.sqrt(cc.areas[c]) > hit[best] * Math.sqrt(cc.areas[best] ?? 0)) best = c;
  if (!best && cc.areas.length > 1) best = cc.areas.indexOf(Math.max(...cc.areas.slice(1)));
  for (let i = 0; i < w * h; i++) m.d[i] = cc.labels[i] === best ? 1 : 0;
  for (let i = 0; i < w * h; i++) kaynakUygun.d[i] = kaynakUygun.d[i] && m.d[i] ? 1 : 0;
  return { kumas: m, kaynakUygun, cikarilanOran: maskeAlan ? cikarilan / maskeAlan : 0, cokRenkli };
}

/**
 * Tam çözünürlük işlenmiş kareyi (isl, w×h, RGB) alır; kumaş dışı bölgeyi kumaş kopyalarıyla doldurur.
 * Dönen `out` yeni bir tampondur; uygulanmadıysa isl'nin kendisidir.
 */
export async function kenarDoldurma(ctx: Ctx, isl: Uint8Array, w: number, h: number, p: DoldurmaParams = DOLDURMA): Promise<DoldurmaSonuc> {
  const t0 = Date.now();
  const seg = ctx.seg!;
  const { an } = ctx;
  const o = an.olcek;
  const aw = seg.mask.w, ah = seg.mask.h;
  const m = Math.max(2, Math.round(Math.min(aw, ah) * p.payOrani));

  const atla = (neden: string, not: string, uyar: boolean, olcum: Record<string, number | string | boolean | null> = {}) => {
    if (uyar) ctx.uyarilar.push(`doldurma_yapilmadi:${neden}`);
    ctx.olcumler.doldurulan_oran = 0;
    log(ctx, { adim: 'kenar_doldurma', risk: 'dikkat', durum: 'atlandi', not, olcum: { neden, ...olcum } });
    return { uygulandi: false, out: isl, neden } as DoldurmaSonuc;
  };

  if (seg.yariSaydam) return atla('yari_saydam', 'Kumaş yarı saydam (tül/dantel/file): zemin dokunun parçası görünür, kopyayla doldurma yapılmadı', true);
  if (seg.guven < p.enAzGuven) return atla('maske_guveni_dusuk', `Maske güveni düşük (${seg.guven}); yanlış alan doldurulmasın diye yapılmadı`, true, { guven: seg.guven });

  // Maske iyileştirmesi (kart/etiket rengi kumaştan ayrılır).
  const iy = renkIyilestirme(ctx, p);
  const mask = iy.kumas;
  let maskAlan = 0;
  for (let i = 0; i < mask.d.length; i++) maskAlan += mask.d[i];
  const alanOrani = maskAlan / (aw * ah);
  const iyOlcum = { renk_disi_cikarilan: +iy.cikarilanOran.toFixed(3), cok_renkli: iy.cokRenkli, kumas_alan_orani: +alanOrani.toFixed(3) };

  // Doldurulacak alan (analiz ölçeği): maske dışı. Geçiş ağırlığı W: maske içine m..2m derinlikte 0→1.
  // D = maske sınırına uzaklık (2m'ye kadar, art arda aşındırmayla).
  const D = new Uint8Array(aw * ah);
  let er: Mask = mask;
  for (let k = 1; k <= 2 * m; k++) {
    er = morph(er, 1, true);
    for (let i = 0; i < D.length; i++) D[i] += er.d[i];
  }
  const W = new Float32Array(aw * ah);
  let dolduracak = 0;
  for (let i = 0; i < W.length; i++) {
    const v = D[i] <= m ? 0 : D[i] >= 2 * m ? 1 : (D[i] - m) / m;
    W[i] = v;
    if (v < 1) dolduracak++;
  }
  const dolduracakOran = dolduracak / (aw * ah);
  if (dolduracakOran < p.ihmalOrani) return atla('kumas_kadraji_dolduruyor', 'Kumaş kadrajı zaten dolduruyor; doldurulacak alan yok', false, { dolduracak_oran: +dolduracakOran.toFixed(4), ...iyOlcum });
  if (alanOrani < p.enAzAlan) return atla('kumas_alani_kucuk', `Kumaş kadrajın %${Math.round(alanOrani * 100)}'ini kaplıyor (< %${Math.round(p.enAzAlan * 100)}); kaynak yetersiz`, true, iyOlcum);

  // Kaynak bölgesi: (maske ∧ renk uygun) 2m aşındırılmış. En büyük temiz kare.
  const S: Mask = { w: aw, h: ah, d: new Uint8Array(aw * ah) };
  for (let i = 0; i < S.d.length; i++) S.d[i] = er.d[i] && iy.kaynakUygun.d[i] ? 1 : 0;
  const IS = integral(S.d, aw, ah);
  const sq = largestSquare(S);
  const sqKaynak = Math.floor(sq.side * o);
  if (sqKaynak < p.enAzKaynak) return atla('kaynak_kucuk', `Temiz kumaş karesi ${sqKaynak} px (< ${p.enAzKaynak}); kaynak yetersiz`, true, { temiz_kare_px: sqKaynak, ...iyOlcum });

  // Doku periyodu (kaynak px) — temiz karenin merkezinden.
  const per = await dokuPeriyodu(ctx, sq.x + sq.side / 2, sq.y + sq.side / 2);
  const periyot = per.periyot;
  if (periyot !== null && sqKaynak < p.enAzPeriyotKati * periyot) return atla('desen_raporu_buyuk', `Doku periyodu ${periyot} px, temiz kare ${sqKaynak} px: rapor kaynağa sığmıyor`, true, { periyot_px: periyot, temiz_kare_px: sqKaynak, ...iyOlcum });

  // Blok boyutu (kaynak px): ≈ blokPeriyotKati × periyot, [enAzBlok, enCokBlok], kaynak karenin ≤ %75'i, kadrajın ≤ 1/3'ü.
  let B = Math.round(Math.max(p.enAzBlok, periyot ? p.blokPeriyotKati * periyot : 0));
  B = Math.min(B, p.enCokBlok, Math.floor(sqKaynak * 0.75), Math.floor(Math.min(w, h) / 3));
  if (B < 64) return atla('kaynak_kucuk', `Blok ${B} px çok küçük; kaynak yetersiz`, true, { temiz_kare_px: sqKaynak, ...iyOlcum });
  const O = Math.max(8, Math.round(B * p.ortusme));
  const adim = B - O;
  const Ban = B / o; // analiz px (kesirli)

  // ---- Planlama (analiz ölçeği) ----
  const img = an.img.d;
  const tuval = new Uint8Array(img.length);
  tuval.set(img);
  const bilinen = new Uint8Array(aw * ah);
  for (let i = 0; i < bilinen.length; i++) bilinen[i] = W[i] > 0 ? 1 : 0;
  const IW = integral(Float32Array.from(W, (v) => (v < 1 ? 1 : 0)), aw, ah); // doldurulacak piksel sayısı

  // Doku varyansı (kaynak karede, analiz ölçeği; RGB ortalaması) — dikiş hatasını normalize etmek için.
  let vs = 0, vs2 = 0, vn = 0;
  for (let y = sq.y; y < sq.y + sq.side; y += 2)
    for (let x = sq.x; x < sq.x + sq.side; x += 2)
      for (let c = 0; c < 3; c++) { const v = img[(y * aw + x) * 3 + c]; vs += v; vs2 += v * v; vn++; }
  const varyans = Math.max(1, vs2 / vn - (vs / vn) ** 2);

  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  // Aday kaynak (kaynak px) temiz bölgede tamamen içeride mi?
  const gecerli = (sx: number, sy: number) => {
    if (sx < 0 || sy < 0 || sx + B > w || sy + B > h) return false;
    const x0 = Math.floor(sx / o), y0 = Math.floor(sy / o), x1 = Math.min(aw, Math.ceil((sx + B) / o)), y1 = Math.min(ah, Math.ceil((sy + B) / o));
    if (x1 - x0 < 1 || y1 - y0 < 1) return false;
    return boxSum(IS, aw, x0, y0, x1, y1) >= (x1 - x0) * (y1 - y0);
  };
  // Kaynak sınırlayıcı kutusu (analiz px).
  let bx0 = aw, by0 = ah, bx1 = 0, by1 = 0;
  for (let y = 0; y < ah; y++) for (let x = 0; x < aw; x++) if (S.d[y * aw + x]) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
  const rastgeleAday = (): [number, number] | null => {
    for (let t = 0; t < 20; t++) {
      const sx = Math.round((bx0 + rnd() * Math.max(0, bx1 - bx0 - Ban)) * o), sy = Math.round((by0 + rnd() * Math.max(0, by1 - by0 - Ban)) * o);
      if (gecerli(sx, sy)) return [sx, sy];
    }
    return null;
  };
  // Yakın aday: hedefin kaynak kutusuna en yakın noktası çevresinde (σ ≈ blok). Perspektif/ışık eğimi
  // nedeniyle ilmek ölçeği ve parlaklık en çok yakın bölgede benzer.
  const gaussRnd = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const yakinAday = (dx: number, dy: number): [number, number] | null => {
    const px = Math.max(bx0 * o, Math.min((bx1 - Ban) * o, dx)), py = Math.max(by0 * o, Math.min((by1 - Ban) * o, dy));
    for (let t = 0; t < 20; t++) {
      const sx = Math.round(px + gaussRnd() * B * p.yakinSigma), sy = Math.round(py + gaussRnd() * B * p.yakinSigma);
      if (gecerli(sx, sy)) return [sx, sy];
    }
    return null;
  };
  const kisa = Math.min(w, h);
  // Hata: hedef blok alanındaki bilinen analiz piksellerinde tuval ile kaynak farkı (kare, RGB ort.; 2'şer atlayarak).
  const hata = (dx: number, dy: number, sx: number, sy: number): [number, number] => {
    const ax0 = Math.ceil(dx / o), ay0 = Math.ceil(dy / o), ax1 = Math.min(aw, Math.floor((dx + B) / o)), ay1 = Math.min(ah, Math.floor((dy + B) / o));
    const ox = (sx - dx) / o, oy = (sy - dy) / o;
    let s = 0, n = 0;
    for (let y = ay0; y < ay1; y += 2) {
      const yy = Math.round(y + oy);
      if (yy < 0 || yy >= ah) continue;
      for (let x = ax0; x < ax1; x += 2) {
        const i = y * aw + x;
        if (!bilinen[i]) continue;
        const xx = Math.round(x + ox);
        if (xx < 0 || xx >= aw) continue;
        const j = yy * aw + xx;
        const d0 = tuval[i * 3] - img[j * 3], d1 = tuval[i * 3 + 1] - img[j * 3 + 1], d2 = tuval[i * 3 + 2] - img[j * 3 + 2];
        s += d0 * d0 + d1 * d1 + d2 * d2;
        n++;
      }
    }
    return [n ? s / (3 * n) : 0, n];
  };
  const xs: number[] = [], ys: number[] = [];
  for (let x = 0; x + B < w; x += adim) xs.push(x);
  xs.push(Math.max(0, w - B));
  for (let y = 0; y + B < h; y += adim) ys.push(y);
  ys.push(Math.max(0, h - B));
  const anRect = (dx: number, dy: number) => [Math.floor(dx / o), Math.floor(dy / o), Math.min(aw, Math.ceil((dx + B) / o)), Math.min(ah, Math.ceil((dy + B) / o))] as const;
  // Gerekli bloklar (doldurulacak piksel içeren).
  let kalan: { gx: number; gy: number }[] = [];
  for (let gy = 0; gy < ys.length; gy++)
    for (let gx = 0; gx < xs.length; gx++) {
      const [x0, y0, x1, y1] = anRect(xs[gx], ys[gy]);
      if (boxSum(IW, aw, x0, y0, x1, y1) > 0) kalan.push({ gx, gy });
    }
  const yerlesim: Yerlesim[] = [];
  const grid = new Map<string, Yerlesim>();
  const ilk = rastgeleAday() ?? [Math.round(sq.x * o), Math.round(sq.y * o)];
  // Katmanlı sıra: her turda bilinen piksele değen bloklar (bilinen sayısı en yüksek önce), sonra yenile.
  while (kalan.length) {
    const IB = integral(bilinen, aw, ah);
    const puanli = kalan.map((k) => { const [x0, y0, x1, y1] = anRect(xs[k.gx], ys[k.gy]); return { ...k, b: boxSum(IB, aw, x0, y0, x1, y1) }; });
    let katman = puanli.filter((k) => k.b > 0);
    if (!katman.length) katman = puanli; // yalıtılmış ada: kör yerleştir
    katman.sort((a, b) => b.b - a.b || a.gy - b.gy || a.gx - b.gx);
    const katmanSet = new Set(katman.map((k) => `${k.gx},${k.gy}`));
    kalan = kalan.filter((k) => !katmanSet.has(`${k.gx},${k.gy}`));
    for (const { gx, gy } of katman) {
      const dx = xs[gx], dy = ys[gy];
      const adaylar: [number, number][] = [];
      const devam = (k: Yerlesim | undefined) => {
        if (!k) return;
        const cx = k.sx + (dx - k.dx), cy = k.sy + (dy - k.dy);
        const kaymalar: [number, number][] = [[0, 0]];
        if (periyot) {
          const pp = Math.round(periyot);
          for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) if (a || b) kaymalar.push([a * pp, b * pp]);
        }
        for (const [kx, ky] of kaymalar) if (gecerli(cx + kx, cy + ky)) adaylar.push([cx + kx, cy + ky]);
      };
      devam(grid.get(`${gx - 1},${gy}`));
      devam(grid.get(`${gx + 1},${gy}`));
      devam(grid.get(`${gx},${gy - 1}`));
      devam(grid.get(`${gx},${gy + 1}`));
      for (let t = 0; t < p.adaySayisi; t++) { const a = t % 2 ? rastgeleAday() : yakinAday(dx, dy); if (a) adaylar.push(a); }
      if (!adaylar.length) adaylar.push(ilk);
      let best = adaylar[0], bestE = Infinity, bestHam = 0, bestN = 0;
      for (const [sx, sy] of adaylar) {
        const [e, n] = hata(dx, dy, sx, sy);
        // Mesafe cezası: aynı hatada yakın kaynak yeğlenir.
        const ceza = 1 + p.mesafeCezasi * (Math.hypot(sx - dx, sy - dy) / kisa);
        const ec = (e + varyans * 0.01) * ceza;
        if (ec < bestE) { bestE = ec; bestHam = e; bestN = n; best = [sx, sy]; }
        if (n === 0) break; // bilinen piksel yok: ilk aday
      }
      const y: Yerlesim = { gx, gy, dx, dy, sx: best[0], sy: best[1], hata: bestHam, bilinen: bestN };
      yerlesim.push(y);
      grid.set(`${gx},${gy}`, y);
      // Planlama tuvalini güncelle: doldurulacak (W<0.5) analiz pikselleri kaynaktan kopyalanır, blok alanı bilinir.
      const ax0 = Math.ceil(dx / o), ay0 = Math.ceil(dy / o), ax1 = Math.min(aw, Math.floor((dx + B) / o)), ay1 = Math.min(ah, Math.floor((dy + B) / o));
      const ox = (best[0] - dx) / o, oy = (best[1] - dy) / o;
      for (let yy = ay0; yy < ay1; yy++) {
        const sy2 = Math.max(0, Math.min(ah - 1, Math.round(yy + oy)));
        for (let xx = ax0; xx < ax1; xx++) {
          const i = yy * aw + xx;
          if (W[i] < 0.5) {
            const j = sy2 * aw + Math.max(0, Math.min(aw - 1, Math.round(xx + ox)));
            tuval[i * 3] = img[j * 3]; tuval[i * 3 + 1] = img[j * 3 + 1]; tuval[i * 3 + 2] = img[j * 3 + 2];
          }
          bilinen[i] = 1;
        }
      }
    }
  }
  if (!yerlesim.length) return atla('kumas_kadraji_dolduruyor', 'Doldurulacak blok yok', false, iyOlcum);
  const olculen = yerlesim.filter((y) => y.bilinen >= 16).map((y) => y.hata).sort((a, b) => a - b);
  const medHata = olculen.length ? olculen[Math.floor(olculen.length / 2)] : 0;
  const dikisNorm = medHata / varyans;
  const olcumOrtak = {
    blok_px: B,
    ortusme_px: O,
    blok_sayisi: yerlesim.length,
    periyot_px: periyot,
    dikis_hatasi_rms: +Math.sqrt(medHata).toFixed(2),
    dikis_norm: +dikisNorm.toFixed(3),
    kaynak_x: Math.round(sq.x * o),
    kaynak_y: Math.round(sq.y * o),
    kaynak_kenar: sqKaynak,
    dolduracak_oran: +dolduracakOran.toFixed(4),
    ...iyOlcum,
  };
  if (dikisNorm > p.dikisEsigi)
    return atla('desen_raporu_buyuk', `Dikiş hatası yüksek (normalize ${dikisNorm.toFixed(2)} > ${p.dikisEsigi}): desen raporu kaynaktan büyük ya da doku düzensiz; döşeme deseni yanlış gösterir`, true, olcumOrtak);

  // ---- Tam çözünürlük kopyalama ----
  const out = new Uint8Array(isl.length);
  out.set(isl);
  const bilinenTam = new Uint8Array(w * h);
  // W tam çözünürlükte (çift doğrusal, analiz ölçeğinden), satır satır önbelleksiz hesap.
  const Wtam = (x: number, y: number) => {
    const fx = (x + 0.5) / o - 0.5, fy = (y + 0.5) / o - 0.5;
    const x0 = Math.max(0, Math.min(aw - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(ah - 1, Math.floor(fy)));
    const x1 = Math.min(aw - 1, x0 + 1), y1 = Math.min(ah - 1, y0 + 1);
    const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
    const a = W[y0 * aw + x0], b = W[y0 * aw + x1], c = W[y1 * aw + x0], d = W[y1 * aw + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
  const Wsatir = new Float32Array(w);
  const Wtum = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) { const v = Wtam(x, y); Wsatir[x] = v; bilinenTam[y * w + x] = v > 0 ? 1 : 0; }
    Wtum.set(Wsatir, y * w);
  }
  const lum = (d: Uint8Array, k: number) => 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2];
  const f = Math.max(3, Math.round(O * p.yumusatma)); // düz kumaşta parlaklık basamağını yayar; dokulu kumaşta kesim zaten hizalı
  // Dikiş kesimi: şerit boyunca (N adım) O genişlikte en küçük maliyetli yol. kenar: 0 sol, 1 üst, 2 sağ, 3 alt.
  const maliyet = new Float32Array(B * O), E = new Float32Array(B * O);
  const kes = (dx: number, dy: number, sx: number, sy: number, kenar: number): Int16Array | null => {
    const N = B, M = O;
    let var_ = false;
    for (let v = 0; v < N; v++)
      for (let u = 0; u < M; u++) {
        // (bu, bv): blok içi koordinat
        const bu = kenar === 0 ? u : kenar === 2 ? B - 1 - u : v;
        const bv = kenar === 1 ? u : kenar === 3 ? B - 1 - u : v;
        const x = dx + bu, y = dy + bv;
        const i = y * w + x;
        if (bilinenTam[i]) { var_ = true; maliyet[v * M + u] = (lum(out, i * 3) - lum(isl, ((sy + bv) * w + sx + bu) * 3)) ** 2; }
        else maliyet[v * M + u] = 0;
      }
    if (!var_) return null;
    for (let u = 0; u < M; u++) E[u] = maliyet[u];
    for (let v = 1; v < N; v++)
      for (let u = 0; u < M; u++) {
        let mn = E[(v - 1) * M + u];
        if (u > 0 && E[(v - 1) * M + u - 1] < mn) mn = E[(v - 1) * M + u - 1];
        if (u < M - 1 && E[(v - 1) * M + u + 1] < mn) mn = E[(v - 1) * M + u + 1];
        E[v * M + u] = maliyet[v * M + u] + mn;
      }
    const yol = new Int16Array(N);
    let u = 0;
    for (let k = 1; k < M; k++) if (E[(N - 1) * M + k] < E[(N - 1) * M + u]) u = k;
    yol[N - 1] = u;
    for (let v = N - 2; v >= 0; v--) {
      let bu = u;
      if (u > 0 && E[v * M + u - 1] < E[v * M + bu]) bu = u - 1;
      if (u < M - 1 && E[v * M + u + 1] < E[v * M + bu]) bu = u + 1;
      u = bu;
      yol[v] = u;
    }
    return yol;
  };
  const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  for (const y of yerlesim) {
    const { dx, dy, sx, sy } = y;
    const yollar = [kes(dx, dy, sx, sy, 0), kes(dx, dy, sx, sy, 1), kes(dx, dy, sx, sy, 2), kes(dx, dy, sx, sy, 3)];
    for (let v = 0; v < B; v++) {
      const yy = dy + v;
      for (let u = 0; u < B; u++) {
        const xx = dx + u;
        const i = yy * w + xx;
        let wgt = 1;
        if (bilinenTam[i]) {
          // Her kenarda: kesim yolunun "iç" tarafı yeni blok, dış tarafı mevcut içerik.
          if (yollar[0] && u < O) wgt = Math.min(wgt, clamp01((u - yollar[0][v]) / f + 0.5));
          if (yollar[1] && v < O) wgt = Math.min(wgt, clamp01((v - yollar[1][u]) / f + 0.5));
          if (yollar[2] && u >= B - O) wgt = Math.min(wgt, clamp01((B - 1 - u - yollar[2][v]) / f + 0.5));
          if (yollar[3] && v >= B - O) wgt = Math.min(wgt, clamp01((B - 1 - v - yollar[3][u]) / f + 0.5));
        }
        if (wgt <= 0) continue;
        const k = i * 3, ks = ((sy + v) * w + (sx + u)) * 3;
        if (wgt >= 1) { out[k] = isl[ks]; out[k + 1] = isl[ks + 1]; out[k + 2] = isl[ks + 2]; }
        else for (let c = 0; c < 3; c++) out[k + c] = Math.round(out[k + c] * (1 - wgt) + isl[ks + c] * wgt);
      }
    }
    for (let v = 0; v < B; v++) bilinenTam.fill(1, (dy + v) * w + dx, (dy + v) * w + dx + B);
  }
  // Son birleştirme: maske içi gerçek kumaş bit düzeyinde aynen; m..2m bandında harman.
  let doluPx = 0;
  for (let i = 0; i < w * h; i++) {
    const wgt = Wtum[i];
    const k = i * 3;
    if (wgt >= 1) { out[k] = isl[k]; out[k + 1] = isl[k + 1]; out[k + 2] = isl[k + 2]; continue; }
    doluPx++;
    if (wgt <= 0) continue;
    for (let c = 0; c < 3; c++) out[k + c] = Math.round(isl[k + c] * wgt + out[k + c] * (1 - wgt));
  }
  const oran = doluPx / (w * h);
  ctx.olcumler.doldurulan_oran = +oran.toFixed(4);
  ctx.uyarilar.push('kenar_kumasla_tamamlandi');
  log(ctx, {
    adim: 'kenar_doldurma',
    risk: 'dikkat',
    durum: 'uygulandi',
    not: `Kumaş dışı %${(oran * 100).toFixed(1)} alan, kumaşın kendi pikselleri 1:1 kopyalanarak dolduruldu (üretken işlem yok; ${B} px blok, ${O} px örtüşme, en küçük hatalı dikiş)`,
    olcum: { ...olcumOrtak, doldurulan_oran: +oran.toFixed(4), sure_ms: Date.now() - t0 },
  });
  return { uygulandi: true, out };
}
