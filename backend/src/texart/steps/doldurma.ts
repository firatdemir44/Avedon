// Adım 10 — Kenar doldurma (Dikkat). Kumaş dışı alanlar (kartela başlığı/etiket, boş zemin, kenardaki
// başka nesneler) fotoğrafın KENDİ kumaş pikselleri KOPYALANARAK doldurulur; görsel boyutu ve kadraj
// değişmez. KIRMIZI ÇİZGİ (§1) uyarınca ÜRETKEN HİÇBİR ŞEY YOK: sinir ağı, difüzyon, inpainting,
// bulanık dolgu yok. Yöntem: görüntü kapitonesi (image quilting, Efros–Freeman) — kaynak bloklar
// maske içindeki temiz bölgeden 1:1 ölçekte (yeniden örnekleme yok, tam sayı ötelemeyle) kopyalanır;
// bloklar örtüşür, örtüşmede en küçük hatalı dikiş (dinamik programlama, dört kenarda) + yumuşatma.
// Bloklar bilinen kumaştan dışa doğru katman katman yerleştirilir (her bloğun bilinen komşusu olur).
// Faz kilidi: doku periyodu ölçülmüşse her adayın ötelemesi (kaynak − hedef) iki eksende periyodun
// tam katına yuvarlanır; böylece her kopya, gerçek kumaşla ve komşu kopyalarla aynı fazdadır (örgü
// sırası/çizgi kayması olmaz). "Devam" adayı (komşu bloğun kaynağını aynı ötelemeyle sürdürmek) hafif
// indirimlidir: bant biçimli boşluklar (kartela başlığı) olabildiğince tek parça şerit kopyasıyla dolar.
// Bloklar büyük (≈ 6 periyot, ≥ 192 px): dikiş sayısı az. Planlama analiz ölçeğinde, kopyalama tam
// çözünürlükte.
// Maske iyileştirmesi (yalnız bu adım için, seçim işlemi): adım 1 maskesi bazen kartela kartını da
// kumaş sayar. Ana kumaş kromasından (maske bloklarının (a,b) modu) uzak, kumaş dışına/çerçeveye
// değen ve yeterince büyük (≥ maske alanının %1,5'i) bileşenler kumaş dışı sayılır (doldurulur);
// kumaşın içinde kalan ya da küçük farklı renkli bölgeler (baskı motifi) korunur ama kaynak olarak
// kullanılmaz. Çok renkli kumaşta (blokların > %35'i ana kromadan uzak) bu iyileştirme kapalıdır.
// Parlak kıymık temizliği: zigzag kesim arası beyaz zemin parçaları (maske sınırı/çerçeve yakınında,
// kumaştan belirgin parlak, düşük kromalı) kumaş dışı sayılır ve doldurulur.
// Keskinlik eşleme: kaynak "en keskin" değil, doldurulan yerin KOMŞU gerçek kumaşıyla benzer
// keskinlikte seçilir (adım 0 keskinlik haritası bilinen kumaştan dışa yayılır; aday keskinliği hedefin
// [1/bant, bant] katı dışındaysa elenir, içindeyse log-oranla ağırlıklanır). Sığ alan derinliğinde
// yumuşak kalan kenara net kopya konmaz: dolgu ile gerçek kumaş arasında keskinlik basamağı olmaz.
// Ton eşleme: kopyalanan bloklara komşu gerçek kumaşın düşük frekanslı doğrusal RGB'sine göre kanal
// başına skaler kazanç (parlaklık serbest sınırda, renk oranı dar sınırda). Kazanç yalnız kopyalara;
// maske içi kumaş yalnız global dönüşümlerle yönetilir.
// EK BELİRGİNLİK KAPISI (Fırat 2026-09-26, seçenek A): dolgu bittikten sonra çıktı 1/4 ölçekte
// ölçülür — dikiş yolları boyunca düşük frekanslı gradyan / gerçek kumaşın gradyanı, dolgu–kumaş
// sınırında düşük frekanslı ton basamağı, blok aralığında periyodik gradyan enerjisi (bloklaşma).
// Biri eşiği aşarsa dolgu REDDEDİLİR: orijinal (doldurulmamış) tam kare döner, uyarı
// `doldurma_yapilmadi:ek_belirgin`, ölçümler işlem kaydında.
// Maske içindeki gerçek kumaş pikselleri BİT DÜZEYİNDE korunur; yalnız maske sınırından güvenlik payı
// kadar içeride dar bir geçiş bandı harmanlanır. Yapılmadığı durumlar: maske güveni düşük, yarı saydam
// kumaş, kumaş kadrajın %25'inden az, kaynak temiz kare küçük, dikiş hatası yüksek (desen raporu
// kaynaktan büyük → döşeme deseni yanlış gösterir), ek belirgin.

import { boxSum, components, gauss, integral, largestSquare, morph, percentile, plane, type Mask } from './goruntu';
import { dokuPeriyodu } from './olcek';
import { linearToSrgb, rgbToLab, srgbToLinear } from './renk';
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
  fazKilidi: boolean; // periyot ölçülmüşse ötelemeler periyodun tam katına yuvarlanır
  devamIndirimi: number; // komşu bloğun kaynağını aynı ötelemeyle sürdüren adayın hatası bu katla çarpılır (< 1: tercih)
  payOrani: number; // güvenlik payı (analiz kısa kenarı oranı; en az 2 px)
  dikisEsigi: number; // normalize dikiş hatası (MSE / doku varyansı) bunu aşarsa atlanır
  yumusatma: number; // dikiş çevresinde geçiş genişliği (örtüşmenin oranı; en az 3 px)
  ihmalOrani: number; // doldurulacak alan kadrajın bu oranından azsa "yok" sayılır
  renkBlok: number; // maske iyileştirmesi blok boyu (analiz px)
  renkEsigi: number; // blok ort. (a,b) ana kumaştan bu kadar uzaksa kumaş dışı adayı
  cokRenkOrani: number; // maske bloklarının bu payı ana kromadan uzaksa "çok renkli": iyileştirme kapalı
  enAzCikarma: number; // çıkarılacak bileşen en az maske alanının bu oranı (küçük motifler kalır)
  kiymikBant: number; // parlak kıymık araması: maske sınırından / çerçeveden bu kadar (güvenlik payı katı) içeride
  kiymikDL: number; // maske pikseli çevresindeki kumaşın yerel L ortalamasından bu kadar parlaksa kıymık adayı
  kiymikKroma: number; // kıymık adayının en çok kroması (beyaz zemin/kâğıt)
  keskinlikModu: 'eslesme' | 'en_keskin' | 'yok'; // eslesme: komşu kumaşla aynı netlik (varsayılan); en_keskin/yok yalnız kalibrasyon ve test
  keskinlikBant: number; // aday keskinliği / hedef keskinlik bu aralık dışındaysa ([1/bant, bant]) aday olmaz
  keskinlikAgirlik: number; // aday hatası × (1 + ağırlık × |log2(keskinlik/hedef)|)
  kazancSinir: [number, number]; // blok başına parlaklık kazancı (kopyalanan piksellere) bu aralıkta
  renkKazancSinir: [number, number]; // kanal kazancı / parlaklık kazancı bu aralıkta (yumuşak renk eşleme)
  ekOlcek: number; // ek belirginlik ölçümü bu kat küçültülmüş çıktıda
  ekDikisEsigi: number; // dikiş gradyanı / kumaş gradyanı bunu aşarsa ek belirgin
  ekTonEsigi: number; // dolgu–kumaş sınırında düşük frekanslı ton basamağı (parlaklık 0..255) bunu aşarsa
  ekKeskinlikEsigi: number; // sınırda dolgu/kumaş doku kontrastı oranı bunu aşarsa (keskinlik basamağı)
  ekYamaTonEsigi: number; // komşu blok ton farkı / kumaş referansı bunu aşarsa (yama görünümü)
  ekYamaDokuEsigi: number; // komşu blok doku kontrastı farkı / kumaş referansı bunu aşarsa
  ekFazEsigi: number; // faz_orani bunun ALTINDAYSA (dolgu dokusunun periyodik tutarlılığı kumaştan düşük)
};

export const DOLDURMA: DoldurmaParams = {
  enAzAlan: 0.25,
  enAzGuven: 0.5,
  enAzKaynak: 128,
  enAzPeriyotKati: 2,
  blokPeriyotKati: 6,
  enAzBlok: 192,
  enCokBlok: 384,
  ortusme: 0.34,
  adaySayisi: 240,
  yakinSigma: 1,
  mesafeCezasi: 1.5,
  fazKilidi: true,
  devamIndirimi: 0.85,
  payOrani: 0.006,
  dikisEsigi: 0.6,
  yumusatma: 0.34,
  ihmalOrani: 0.002,
  renkBlok: 8,
  renkEsigi: 4.5,
  cokRenkOrani: 0.35,
  enAzCikarma: 0.015,
  kiymikBant: 3,
  kiymikDL: 8,
  kiymikKroma: 14,
  keskinlikModu: 'eslesme',
  keskinlikBant: 2,
  keskinlikAgirlik: 1.0,
  kazancSinir: [0.7, 1.4],
  renkKazancSinir: [0.92, 1.08],
  ekOlcek: 4,
  // Kalibrasyon (2026-09-26, haki pike + eğik krem interlok): eski dolgu (128 px blok, faz kilidi yok,
  // en keskin kaynak, yalnız parlaklık kazancı) keskinlik 1,17/1,25 ve yama doku 1,12/1,78 ölçtü (ekler
  // gözle görünür); yeni dolgu 1,05/1,05 ve 0,92/0,82 (görünmez). Eşikler ikisinin arasında.
  ekDikisEsigi: 1.5,
  ekTonEsigi: 2.5,
  ekKeskinlikEsigi: 1.12,
  ekYamaTonEsigi: 1.5,
  ekYamaDokuEsigi: 1.05,
  ekFazEsigi: 0, // yalnız bilgi: perspektifli çekimde kafes periyodu derinlikle değişir, oran güvenilir kapı değil
};

export type DoldurmaSonuc = { uygulandi: boolean; out: Uint8Array; neden?: string };

export type EkOlcum = {
  dikis_gradyan: number; // dikiş yolları boyunca ort. düşük frekanslı gradyan (1/4 ölçek, parlaklık/px)
  kumas_gradyan: number; // gerçek kumaşta aynı ölçüde ort. gradyan
  dikis_orani: number; // dikiş / kumaş (tabanlı)
  ton_farki: number; // dolgu–kumaş sınırında düşük frekanslı ton basamağı (parlaklık 0..255)
  sinir_keskinlik: number; // sınır boyunca dolgu / kumaş doku kontrastı oranı (1 = aynı netlik; log-ortalama)
  yama_ton: number; // komşu blok çekirdekleri arası ort. ton farkı medyanı (parlaklık)
  kumas_ton: number; // gerçek kumaşta aynı aralıklı pencereler arası ton farkı medyanı
  yama_ton_orani: number; // yama_ton / (kumas_ton + taban)
  yama_doku: number; // komşu blok çekirdekleri arası doku kontrastı |log| farkı medyanı
  kumas_doku: number; // gerçek kumaşta aynı istatistik
  yama_doku_orani: number; // yama_doku / (kumas_doku + taban)
  yama_ton90: number; // aynı istatistiklerin %90 yüzdeliği (azınlıktaki bozuk bloklar da görünür)
  kumas_ton90: number;
  yama_doku90: number;
  kumas_doku90: number;
  blok_cifti: number; // ölçülen komşu blok çifti sayısı
  faz_dolgu: number; // dolguda periyot gecikmeli otokorelasyon (x,y küçüğü)
  faz_kumas: number; // gerçek kumaşta aynı
  faz_orani: number; // faz_dolgu / faz_kumas (1 = aynı tutarlılık; küçük = dikişlerde faz kayması)
};

type Yerlesim = { gx: number; gy: number; dx: number; dy: number; sx: number; sy: number; hata: number; bilinen: number; kazanc: [number, number, number] };

/**
 * Parlak kıymık temizliği (seçim işlemi): zigzag (pinking) kesim kenarının dişleri arasındaki beyaz
 * zemin parçaları adım 1'in "kapa" morfolojisiyle maskeye sızabilir ve çerçeve kenarında aşındırma
 * işlemez. Maske sınırına ya da çerçeveye yakın (bant), kumaş L medyanından belirgin parlak ve düşük
 * kromalı pikseller kumaş dışı sayılır; kumaşın içindeki parlaklıklar (bant dışı) dokunulmaz kalır.
 * Ardından yalnız en büyük bileşen kalır (kopan diş uçları kaynak olmaz).
 */
function parlakKiymik(ctx: Ctx, mask: Mask, pay: number, p: DoldurmaParams): { mask: Mask; oran: number } {
  const { w, h } = mask;
  const img = ctx.an.img.d;
  const ham = ctx.seg?.ham;
  const bant = Math.max(2, Math.round(pay * p.kiymikBant));
  // Lab L ve kroma düzlemleri; kumaşın YEREL parlaklığı (maske üzerinde normalize Gauss, σ = bant):
  // gölgedeki zigzag boşluğu global medyandan parlak olmayabilir ama çevresindeki kumaştan parlaktır.
  const Ll = plane(w, h), Kr = plane(w, h), Lm = plane(w, h), M = plane(w, h);
  for (let i = 0; i < w * h; i++) {
    const [l, a, b] = rgbToLab(img[i * 3], img[i * 3 + 1], img[i * 3 + 2]);
    Ll.d[i] = l; Kr.d[i] = Math.hypot(a, b);
    if (mask.d[i]) { Lm.d[i] = l; M.d[i] = 1; }
  }
  const gL = gauss(Lm, bant), gM = gauss(M, bant);
  const ic = morph(mask, bant, true); // sınırdan bant kadar içerisi
  const out: Mask = { w, h, d: Uint8Array.from(mask.d) };
  let cikan = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask.d[i]) continue;
      const kenarda = !ic.d[i] || x < bant || y < bant || x >= w - bant || y >= h - bant;
      if (!kenarda) continue;
      const yerel = gM.d[i] > 1e-3 ? gL.d[i] / gM.d[i] : Ll.d[i];
      if (Kr.d[i] > p.kiymikKroma) continue;
      // Morfolojinin (kapa) eklediği piksel (ham kümeleme kumaş dememiş) hafif parlaksa bile; kümeleme
      // kumaş demişse belirgin parlak olmalı.
      const esik = ham && !ham.d[i] ? p.kiymikDL * 0.4 : p.kiymikDL;
      if (Ll.d[i] - yerel >= esik) { out.d[i] = 0; cikan++; }
    }
  if (!cikan) return { mask, oran: 0 };
  // Yalnız en büyük bileşen (kopan diş uçları, tek pikseller kalkar).
  const cc = components(out);
  let best = 0;
  for (let c = 1; c < cc.areas.length; c++) if (cc.areas[c] > (cc.areas[best] ?? 0)) best = c;
  let alan = 0;
  for (let i = 0; i < w * h; i++) { out.d[i] = cc.labels[i] === best ? 1 : 0; alan += mask.d[i]; }
  return { mask: out, oran: alan ? cikan / alan : 0 };
}

/**
 * Hedef alanı: bilinen (gerçek) kumaşın düşük frekanslı bir değeri (doğrusal kanal parlaklığı ya da
 * keskinlik), maske dışına en yakın kumaştan katman katman yayılarak uzatılır (kaymasız, yumuşak).
 * Kopyalanan blokların kazancı/keskinlik hedefi bu alana göre verilir; komşu KOPYAYA oranlamak
 * zincirleme hata biriktirir (yama yama görünüm). Ölçek: analiz / k. `deger(ax, ay)` çift doğrusal okur.
 * Bilinen hücre yoksa null (hedef yok).
 */
function hedefAlani(vals: Float32Array, known: Uint8Array, aw: number, ah: number, sigmaAn: number, k = 4): ((ax: number, ay: number) => number) | null {
  const gw = Math.max(1, Math.floor(aw / k)), gh = Math.max(1, Math.floor(ah / k));
  const S = plane(gw, gh), C = plane(gw, gh);
  for (let y = 0; y < gh * k; y++)
    for (let x = 0; x < gw * k; x++) {
      const i = y * aw + x;
      if (!known[i]) continue;
      const j = Math.floor(y / k) * gw + Math.floor(x / k);
      S.d[j] += vals[i]; C.d[j] += 1;
    }
  const gS = gauss(S, sigmaAn / k), gC = gauss(C, sigmaAn / k);
  const T = plane(gw, gh);
  const bil = new Uint8Array(gw * gh);
  let bilinenSayi = 0;
  for (let i = 0; i < gw * gh; i++) if (gC.d[i] > 0.05 * k * k) { T.d[i] = gS.d[i] / gC.d[i]; bil[i] = 1; bilinenSayi++; }
  if (!bilinenSayi) {
    let s = 0, c = 0;
    for (let i = 0; i < gw * gh; i++) if (C.d[i]) { s += S.d[i] / C.d[i]; c++; }
    if (!c) return null;
    T.d.fill(s / c); bil.fill(1);
  }
  // Dışa yayılım: bilinen komşusu olan bilinmeyen hücreler komşu ortalamasını alır (tur tur).
  let degisti = true;
  const yeni = new Float32Array(gw * gh), yeniB = new Uint8Array(gw * gh);
  for (let tur = 0; tur < gw + gh && degisti; tur++) {
    degisti = false;
    yeniB.set(bil);
    for (let y = 0; y < gh; y++)
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        if (bil[i]) continue;
        let s = 0, c = 0;
        if (x > 0 && bil[i - 1]) { s += T.d[i - 1]; c++; }
        if (x < gw - 1 && bil[i + 1]) { s += T.d[i + 1]; c++; }
        if (y > 0 && bil[i - gw]) { s += T.d[i - gw]; c++; }
        if (y < gh - 1 && bil[i + gw]) { s += T.d[i + gw]; c++; }
        if (c) { yeni[i] = s / c; yeniB[i] = 1; degisti = true; }
      }
    for (let i = 0; i < gw * gh; i++) if (!bil[i] && yeniB[i]) T.d[i] = yeni[i];
    bil.set(yeniB);
  }
  return (ax: number, ay: number) => {
    const fx = ax / k - 0.5, fy = ay / k - 0.5;
    const x0 = Math.max(0, Math.min(gw - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(gh - 1, Math.floor(fy)));
    const x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1);
    const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
    const a = T.d[y0 * gw + x0], b = T.d[y0 * gw + x1], c = T.d[y1 * gw + x0], d = T.d[y1 * gw + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
}

/** Üç kanallı hedef alanı (doğrusal RGB). */
function rgbHedefi(R: Float32Array, G: Float32Array, Bc: Float32Array, known: Uint8Array, aw: number, ah: number, sigmaAn: number) {
  const f = [hedefAlani(R, known, aw, ah, sigmaAn), hedefAlani(G, known, aw, ah, sigmaAn), hedefAlani(Bc, known, aw, ah, sigmaAn)];
  return (ax: number, ay: number): [number, number, number] => [f[0] ? f[0](ax, ay) : 0.2, f[1] ? f[1](ax, ay) : 0.2, f[2] ? f[2](ax, ay) : 0.2];
}

/**
 * Kanal başına kazanç: hedef (komşu gerçek kumaşın düşük frekanslı doğrusal RGB'si) / kaynak blok
 * ortalaması. Parlaklık kazancı serbest sınırda; kanal kazancı / parlaklık kazancı dar sınırda (yumuşak
 * renk eşleme: ışık rengi/ton kayması eşitlenir, kumaşın rengi değiştirilmez).
 */
function kanalKazanci(hedef: [number, number, number], kaynak: [number, number, number], p: DoldurmaParams): [number, number, number] {
  const [gLo, gHi] = p.kazancSinir, [rLo, rHi] = p.renkKazancSinir;
  const yH = 0.2126 * hedef[0] + 0.7152 * hedef[1] + 0.0722 * hedef[2];
  const yK = 0.2126 * kaynak[0] + 0.7152 * kaynak[1] + 0.0722 * kaynak[2];
  if (yK <= 1e-6) return [1, 1, 1];
  const gY = Math.max(gLo, Math.min(gHi, yH / yK));
  const g = [0, 0, 0] as [number, number, number];
  for (let c = 0; c < 3; c++) {
    const gc = kaynak[c] > 1e-6 ? hedef[c] / kaynak[c] : gY;
    g[c] = gY * Math.max(rLo, Math.min(rHi, gc / gY));
  }
  return g;
}

/**
 * Kafes periyodu (eksen başına): radyal FFT periyodu (adım 7) örgü kafesinin x/y ötelemesini vermez
 * (pike/baklava dokuda x ve y periyotları farklıdır; radyal tepe ortalamadır). Temiz karenin merkezinden
 * tam çözünürlük kırpımda doku bandına süzülmüş (BP = gauss(P/6) − gauss(P/2)) parlaklığın x ve y
 * otokorelasyonu [0,6P, 2,4P] gecikmelerinde taranır; en yüksek korelasyonlu gecikme o eksenin kafes
 * periyodudur (korelasyon ≥ 0,3 değilse o eksende radyal periyot kalır). Faz kilidi ve faz ölçümü bunu kullanır.
 */
async function kafesPeriyodu(ctx: Ctx, cxAn: number, cyAn: number, periyot: number): Promise<{ px: number; py: number; kx: number; ky: number }> {
  const { an } = ctx;
  const n = Math.min(640, an.kaynak.w, an.kaynak.h);
  const left = Math.max(0, Math.min(an.kaynak.w - n, Math.round(cxAn * an.olcek - n / 2))), top = Math.max(0, Math.min(an.kaynak.h - n, Math.round(cyAn * an.olcek - n / 2)));
  const reg = await an.oku(left, top, n, n);
  const L = plane(n, n);
  for (let i = 0; i < n * n; i++) L.d[i] = 0.299 * reg.d[i * 3] + 0.587 * reg.d[i * 3 + 1] + 0.114 * reg.d[i * 3 + 2];
  const bp = gauss(L, periyot / 6), bg = gauss(L, periyot / 2);
  for (let i = 0; i < n * n; i++) bp.d[i] -= bg.d[i];
  const kor = (lx: number, ly: number) => {
    let sxy = 0, sxx = 0, syy = 0;
    for (let y = 0; y + ly < n; y += 2)
      for (let x = 0; x + lx < n; x += 2) { const i = y * n + x, j = (y + ly) * n + x + lx; sxy += bp.d[i] * bp.d[j]; sxx += bp.d[i] ** 2; syy += bp.d[j] ** 2; }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
  };
  const lo = Math.max(3, Math.round(periyot * 0.6)), hi = Math.min(Math.floor(n / 3), Math.round(periyot * 2.4));
  let px = periyot, py = periyot, kx = -1, ky = -1;
  for (let l = lo; l <= hi; l++) { const cx = kor(l, 0), cy = kor(0, l); if (cx > kx) { kx = cx; px = l; } if (cy > ky) { ky = cy; py = l; } }
  return { px: kx >= 0.3 ? px : periyot, py: ky >= 0.3 ? py : periyot, kx: +kx.toFixed(2), ky: +ky.toFixed(2) };
}

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
 * Ek belirginlik ölçümü (kalite kapısı; saf işlev, test edilebilir). Çıktı `out` (w×h RGB) `k` kat
 * küçültülür (kutu ortalaması, parlaklık). `Wtum`: 1 = gerçek kumaş (bit düzeyinde korunan), 0 = dolgu,
 * arası geçiş bandı. `dikis`: tam çözünürlükte dikiş yolu haritası (kesim yolları + geçiş bandı).
 * Doku, σ ≈ periyot/2 (1/4 ölçekte) Gauss ile bastırılır; kalan gradyan basamak/dikiş enerjisidir.
 *  - dikis_orani: dikiş piksellerindeki ort. gradyan / gerçek kumaştaki ort. gradyan (+ küçük taban:
 *    ışığı düz kumaşta sıfıra yakın payda görünmez farkı büyütmesin).
 *  - ton_farki: sınır piksellerinde dolgu tarafı ile kumaş tarafının Gauss (σ ≈ blok/2) ortalama
 *    parlaklık farkı (parlaklık 0..255).
 *  - sinir_keskinlik: sınır boyunca dolgu tarafı / kumaş tarafı doku kontrastı (hp RMS) oranı; bulanık
 *    kenara net kopya (ya da tersi) konduysa 1'den uzaklaşır.
 *  - yama_ton_orani / yama_doku_orani: komşu blok çekirdekleri (örtüşme dışı iç alan) arasındaki
 *    düşük frekanslı ton farkı ve doku kontrastı (log) farkı medyanı; referans gerçek kumaşta aynı
 *    aralık ve boyuttaki pencerelerin komşu farkı. Yama yama görünüm = bu oranların büyümesi.
 */
export function ekOlcumu(
  out: Uint8Array,
  w: number,
  h: number,
  Wtum: Float32Array,
  dikis: Uint8Array,
  B: number,
  O: number,
  bloklar: { gx: number; gy: number; dx: number; dy: number }[],
  periyot: number | null,
  kafes: [number, number] | null,
  k = 4
): EkOlcum {
  const wq = Math.max(1, Math.floor(w / k)), hq = Math.max(1, Math.floor(h / k));
  const L = plane(wq, hq);
  const real = new Uint8Array(wq * hq), fill = new Uint8Array(wq * hq), seam = new Uint8Array(wq * hq);
  for (let y = 0; y < hq; y++)
    for (let x = 0; x < wq; x++) {
      let s = 0, nr = 0, nf = 0, ns = 0;
      for (let v = 0; v < k; v++)
        for (let u = 0; u < k; u++) {
          const i = (y * k + v) * w + x * k + u;
          s += 0.299 * out[i * 3] + 0.587 * out[i * 3 + 1] + 0.114 * out[i * 3 + 2];
          if (Wtum[i] >= 1) nr++;
          else if (Wtum[i] <= 0) nf++;
          if (dikis[i]) ns++;
        }
      const j = y * wq + x;
      L.d[j] = s / (k * k);
      real[j] = nr === k * k ? 1 : 0;
      fill[j] = nf === k * k ? 1 : 0;
      seam[j] = ns ? 1 : 0;
    }
  const sigma = Math.max(1.5, periyot ? periyot / k / 2 : 1.5);
  const G = gauss(L, sigma);
  const grad = plane(wq, hq);
  for (let y = 1; y < hq - 1; y++)
    for (let x = 1; x < wq - 1; x++) {
      const j = y * wq + x;
      grad.d[j] = Math.hypot((G.d[j + 1] - G.d[j - 1]) / 2, (G.d[j + wq] - G.d[j - wq]) / 2);
    }
  // Dikiş çevresi (±1 px) ve sınır uzaklığı: gerçek kumaş referansı dikişten/sınırdan uzak.
  const seamD = morph({ w: wq, h: hq, d: seam }, 1, false);
  const realIc = morph({ w: wq, h: hq, d: real }, Math.ceil(sigma) + 2, true);
  let sS = 0, nS = 0, sR = 0, nR = 0;
  for (let y = 1; y < hq - 1; y++)
    for (let x = 1; x < wq - 1; x++) {
      const j = y * wq + x;
      if (seamD.d[j] && !real[j]) { sS += grad.d[j]; nS++; }
      if (realIc.d[j] && !seamD.d[j]) { sR += grad.d[j]; nR++; }
    }
  const dikisG = nS ? sS / nS : 0, kumasG = nR ? sR / nR : 0;
  const dikisOrani = dikisG / (kumasG + 0.08);
  // Ton basamağı: sınır piksellerinde dolgu-tarafı ve kumaş-tarafı yerel ortalama parlaklıkları.
  const st = Math.max(2, B / k / 2);
  const LR = plane(wq, hq), MR = plane(wq, hq), LF = plane(wq, hq), MF = plane(wq, hq);
  for (let j = 0; j < wq * hq; j++) {
    if (real[j]) { LR.d[j] = L.d[j]; MR.d[j] = 1; }
    if (fill[j]) { LF.d[j] = L.d[j]; MF.d[j] = 1; }
  }
  const gLR = gauss(LR, st), gMR = gauss(MR, st), gLF = gauss(LF, st), gMF = gauss(MF, st);
  let sT = 0, nT = 0;
  for (let y = 1; y < hq - 1; y++)
    for (let x = 1; x < wq - 1; x++) {
      const j = y * wq + x;
      if (!real[j]) continue;
      if (real[j - 1] && real[j + 1] && real[j - wq] && real[j + wq]) continue;
      if (gMR.d[j] < 0.05 || gMF.d[j] < 0.05) continue;
      // Ağırlık: yakındaki dolgu miktarı — ince kenar şeritleri geniş bandın ölçümünü sulandırmasın.
      sT += gMF.d[j] * Math.abs(gLR.d[j] / gMR.d[j] - gLF.d[j] / gMF.d[j]);
      nT += gMF.d[j];
    }
  const tonFarki = nT ? sT / nT : 0;
  // İnce ölçek doku kontrastı (keskinlik): TAM çözünürlükte hp = L − gauss(L, 1); hp² k×k kutu ortalaması
  // (bulanıklık ince ölçekte yaşar; 1/4 ölçekte kaybolur).
  const L1 = plane(w, h);
  for (let i = 0; i < w * h; i++) L1.d[i] = 0.299 * out[i * 3] + 0.587 * out[i * 3 + 1] + 0.114 * out[i * 3 + 2];
  const G1 = gauss(L1, 1);
  const hp2 = plane(wq, hq);
  for (let y = 0; y < hq; y++)
    for (let x = 0; x < wq; x++) {
      let s = 0;
      for (let v = 0; v < k; v++) for (let u = 0; u < k; u++) { const i = (y * k + v) * w + x * k + u; s += (L1.d[i] - G1.d[i]) ** 2; }
      hp2.d[y * wq + x] = s / (k * k);
    }
  // Sınırda keskinlik oranı: dolgu tarafı / kumaş tarafı doku kontrastı (RMS), sınır pikselleri boyunca.
  const HR = plane(wq, hq), HF = plane(wq, hq);
  for (let j = 0; j < wq * hq; j++) { if (real[j]) HR.d[j] = hp2.d[j]; if (fill[j]) HF.d[j] = hp2.d[j]; }
  const gHR = gauss(HR, st), gHF = gauss(HF, st);
  let sK = 0, nK = 0;
  for (let y = 1; y < hq - 1; y++)
    for (let x = 1; x < wq - 1; x++) {
      const j = y * wq + x;
      if (!real[j]) continue;
      if (real[j - 1] && real[j + 1] && real[j - wq] && real[j + wq]) continue;
      if (gMR.d[j] < 0.05 || gMF.d[j] < 0.05) continue;
      const rR = Math.sqrt(Math.max(0.0025, gHR.d[j] / gMR.d[j])), rF = Math.sqrt(Math.max(0.0025, gHF.d[j] / gMF.d[j]));
      sK += gMF.d[j] * Math.abs(Math.log(rF / rR));
      nK += gMF.d[j];
    }
  const sinirKeskinlik = Math.exp(nK ? sK / nK : 0);
  // Yama (bloklaşma): komşu blok çekirdekleri arasında düşük frekanslı ton farkı ve doku kontrastı
  // (log) farkı; referans, gerçek kumaşta aynı aralık ve boyutta pencerelerin komşu farkları.
  const core = Math.max(2, Math.floor((B - 2 * O) / k));
  const pencere = (x0: number, y0: number, maske: Uint8Array): [number, number] | null => {
    let sG = 0, sH = 0, n = 0, top = 0;
    for (let y = y0; y < y0 + core; y++)
      for (let x = x0; x < x0 + core; x++) {
        top++;
        if (x < 1 || y < 1 || x >= wq - 1 || y >= hq - 1) continue;
        const j = y * wq + x;
        if (!maske[j]) continue;
        sG += G.d[j]; sH += hp2.d[j]; n++;
      }
    if (n < top * 0.5) return null;
    return [sG / n, Math.sqrt(Math.max(0.0025, sH / n))];
  };
  const yuzdelik = (a: number[], q: number) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  const medyan = (a: number[]) => yuzdelik(a, 0.5);
  const fT: number[] = [], fD: number[] = [];
  const blokIst = new Map<string, [number, number]>();
  for (const b of bloklar) {
    const v = pencere(Math.ceil((b.dx + O) / k), Math.ceil((b.dy + O) / k), fill);
    if (v) blokIst.set(`${b.gx},${b.gy}`, v);
  }
  // İkinci fark (üçlü: sol–orta–sağ / üst–orta–alt): düzgün ışık eğimi sıfırlanır, yama basamağı kalır.
  const ikinciFark = (ist: Map<string, [number, number]>, T: number[], Dd: number[]) => {
    for (const [key, a] of ist) {
      const [gx, gy] = key.split(',').map(Number);
      for (const [l, r] of [[ist.get(`${gx - 1},${gy}`), ist.get(`${gx + 1},${gy}`)], [ist.get(`${gx},${gy - 1}`), ist.get(`${gx},${gy + 1}`)]]) {
        if (!l || !r) continue;
        T.push(Math.abs(2 * a[0] - l[0] - r[0]));
        Dd.push(Math.abs(2 * Math.log(a[1]) - Math.log(l[1]) - Math.log(r[1])));
      }
    }
  };
  ikinciFark(blokIst, fT, fD);
  const rT: number[] = [], rD: number[] = [];
  const adimQ = Math.max(1, Math.round((B - O) / k));
  const realIst = new Map<string, [number, number]>();
  const realIc2 = morph({ w: wq, h: hq, d: real }, Math.ceil(sigma) + 1, true);
  for (let gy = 0, y0 = 1; y0 + core < hq; gy++, y0 += adimQ)
    for (let gx = 0, x0 = 1; x0 + core < wq; gx++, x0 += adimQ) {
      const v = pencere(x0, y0, realIc2.d);
      if (v) realIst.set(`${gx},${gy}`, v);
    }
  ikinciFark(realIst, rT, rD);
  // Faz tutarlılığı: doku periyodu biliniyorsa, doku bandına süzülmüş (BP = gauss(σ=P/6) − gauss(σ=P/2))
  // tam çözünürlük parlaklıkta P gecikmeli otokorelasyon (x ve y), dolgu ve gerçek kumaşta ayrı.
  // Faz kaymalı döşeme dikişlerde korelasyonu düşürür; oran = dolgu / kumaş (küçüğü iki eksenin).
  let fazOrani = 1, fazDolgu = 1, fazKumas = 1;
  if (periyot && periyot >= 6 && kafes) {
    const [Px, Py] = kafes;
    const bp = gauss(L1, periyot / 6), bg = gauss(L1, periyot / 2);
    for (let i = 0; i < w * h; i++) bp.d[i] -= bg.d[i];
    const kor = (maskeTam: (i: number) => boolean, lx: number, ly: number) => {
      let sxy = 0, sxx = 0, syy = 0, n = 0;
      for (let y = 0; y + ly < h; y += 2)
        for (let x = 0; x + lx < w; x += 2) {
          const i = y * w + x, j = (y + ly) * w + x + lx;
          if (!maskeTam(i) || !maskeTam(j)) continue;
          sxy += bp.d[i] * bp.d[j]; sxx += bp.d[i] ** 2; syy += bp.d[j] ** 2; n++;
        }
      return n > 1000 && sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
    };
    const dolgu = (i: number) => Wtum[i] <= 0, gercekM = (i: number) => Wtum[i] >= 1;
    const fx = kor(dolgu, Px, 0), fy = kor(dolgu, 0, Py), rx = kor(gercekM, Px, 0), ry = kor(gercekM, 0, Py);
    if (fx !== null && fy !== null && rx !== null && ry !== null) {
      fazDolgu = Math.min(fx, fy); fazKumas = Math.min(rx, ry);
      // Kumaşta periyodik yapı zayıfsa (korelasyon < 0.15) ölçüm anlamsız: 1.
      fazOrani = fazKumas >= 0.15 ? Math.max(0, fazDolgu) / fazKumas : 1;
    }
  }
  const yamaTon = medyan(fT), kumasTon = medyan(rT), yamaDoku = medyan(fD), kumasDoku = medyan(rD);
  const yamaTon90 = yuzdelik(fT, 0.9), kumasTon90 = yuzdelik(rT, 0.9), yamaDoku90 = yuzdelik(fD, 0.9), kumasDoku90 = yuzdelik(rD, 0.9);
  return {
    dikis_gradyan: +dikisG.toFixed(3),
    kumas_gradyan: +kumasG.toFixed(3),
    dikis_orani: +dikisOrani.toFixed(3),
    ton_farki: +tonFarki.toFixed(2),
    sinir_keskinlik: +sinirKeskinlik.toFixed(3),
    yama_ton: +yamaTon.toFixed(2),
    kumas_ton: +kumasTon.toFixed(2),
    yama_ton_orani: +(yamaTon / (kumasTon + 0.15)).toFixed(3),
    yama_doku: +yamaDoku.toFixed(3),
    kumas_doku: +kumasDoku.toFixed(3),
    yama_doku_orani: +(yamaDoku / (kumasDoku + 0.03)).toFixed(3),
    yama_ton90: +yamaTon90.toFixed(2),
    kumas_ton90: +kumasTon90.toFixed(2),
    yama_doku90: +yamaDoku90.toFixed(3),
    kumas_doku90: +kumasDoku90.toFixed(3),
    blok_cifti: fT.length,
    faz_dolgu: +fazDolgu.toFixed(3),
    faz_kumas: +fazKumas.toFixed(3),
    faz_orani: +fazOrani.toFixed(3),
  };
}

/** Ek belirginlik kapısı: eşik aşan ölçümlerin adları (boş dizi = geçti). */
export function ekKapisi(ek: EkOlcum, p: DoldurmaParams = DOLDURMA): string[] {
  const s: string[] = [];
  if (ek.dikis_orani > p.ekDikisEsigi) s.push('dikis');
  if (ek.ton_farki > p.ekTonEsigi) s.push('ton');
  if (ek.sinir_keskinlik > p.ekKeskinlikEsigi) s.push('keskinlik');
  if (ek.yama_ton_orani > p.ekYamaTonEsigi) s.push('yama_ton');
  if (ek.yama_doku_orani > p.ekYamaDokuEsigi) s.push('yama_doku');
  if (ek.faz_orani < p.ekFazEsigi) s.push('faz');
  return s;
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
  // Parlak kıymıklar (zigzag kesim arası beyaz zemin) maskeden ve kaynaktan çıkar.
  const pk = parlakKiymik(ctx, iy.kumas, m, p);
  const mask = pk.mask;
  const kaynakUygun: Mask = { w: aw, h: ah, d: new Uint8Array(aw * ah) };
  for (let i = 0; i < kaynakUygun.d.length; i++) kaynakUygun.d[i] = iy.kaynakUygun.d[i] && mask.d[i] ? 1 : 0;
  let maskAlan = 0;
  for (let i = 0; i < mask.d.length; i++) maskAlan += mask.d[i];
  const alanOrani = maskAlan / (aw * ah);
  const iyOlcum = { renk_disi_cikarilan: +iy.cikarilanOran.toFixed(3), parlak_kiymik_cikarilan: +pk.oran.toFixed(4), cok_renkli: iy.cokRenkli, kumas_alan_orani: +alanOrani.toFixed(3) };

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
  for (let i = 0; i < S.d.length; i++) S.d[i] = er.d[i] && kaynakUygun.d[i] ? 1 : 0;
  const IS = integral(S.d, aw, ah);
  const sq = largestSquare(S);
  const sqKaynak = Math.floor(sq.side * o);
  if (sqKaynak < p.enAzKaynak) return atla('kaynak_kucuk', `Temiz kumaş karesi ${sqKaynak} px (< ${p.enAzKaynak}); kaynak yetersiz`, true, { temiz_kare_px: sqKaynak, ...iyOlcum });

  // Doku periyodu (kaynak px) — temiz karenin merkezinden.
  const per = await dokuPeriyodu(ctx, sq.x + sq.side / 2, sq.y + sq.side / 2);
  const periyot = per.periyot;
  if (periyot !== null && sqKaynak < p.enAzPeriyotKati * periyot) return atla('desen_raporu_buyuk', `Doku periyodu ${periyot} px, temiz kare ${sqKaynak} px: rapor kaynağa sığmıyor`, true, { periyot_px: periyot, temiz_kare_px: sqKaynak, ...iyOlcum });
  // Kafes (eksen başına gerçek öteleme periyodu): faz kilidi ve devam kaymaları bununla.
  const kf = periyot ? await kafesPeriyodu(ctx, sq.x + sq.side / 2, sq.y + sq.side / 2, periyot) : null;
  const kafes: [number, number] | null = kf ? [kf.px, kf.py] : null;

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
  const gercek = Uint8Array.from(W, (v) => (v >= 1 ? 1 : 0)); // bit düzeyinde korunan gerçek kumaş
  const IW = integral(Float32Array.from(W, (v) => (v < 1 ? 1 : 0)), aw, ah); // doldurulacak piksel sayısı
  // Ton hedefi (planlama, ham analiz): gerçek kumaşın doğrusal RGB alanı dışa yayılmış; kaynak bloğun
  // doğrusal kanal ortalamaları integral görüntüden.
  const LINa = new Float32Array(256);
  for (let v = 0; v < 256; v++) LINa[v] = srgbToLinear(v);
  const RlinAn = new Float32Array(aw * ah), GlinAn = new Float32Array(aw * ah), BlinAn = new Float32Array(aw * ah);
  for (let i = 0; i < aw * ah; i++) { RlinAn[i] = LINa[img[i * 3]]; GlinAn[i] = LINa[img[i * 3 + 1]]; BlinAn[i] = LINa[img[i * 3 + 2]]; }
  const hedefAn = rgbHedefi(RlinAn, GlinAn, BlinAn, gercek, aw, ah, B / o);
  const IR = integral(RlinAn, aw, ah), IG = integral(GlinAn, aw, ah), IB3 = integral(BlinAn, aw, ah);
  const kazancPlan = (dx: number, dy: number, sx: number, sy: number): [number, number, number] => {
    const x0 = Math.floor(sx / o), y0 = Math.floor(sy / o), x1 = Math.min(aw, Math.ceil((sx + B) / o)), y1 = Math.min(ah, Math.ceil((sy + B) / o));
    const n = (x1 - x0) * (y1 - y0);
    if (n <= 0) return [1, 1, 1];
    const kaynak: [number, number, number] = [boxSum(IR, aw, x0, y0, x1, y1) / n, boxSum(IG, aw, x0, y0, x1, y1) / n, boxSum(IB3, aw, x0, y0, x1, y1) / n];
    return kanalKazanci(hedefAn((dx + B / 2) / o, (dy + B / 2) / o), kaynak, p);
  };

  // Doku varyansı (kaynak karede, analiz ölçeği; RGB ortalaması) — dikiş hatasını normalize etmek için.
  let vs = 0, vs2 = 0, vn = 0;
  for (let y = sq.y; y < sq.y + sq.side; y += 2)
    for (let x = sq.x; x < sq.x + sq.side; x += 2)
      for (let c = 0; c < 3; c++) { const v = img[(y * aw + x) * 3 + c]; vs += v; vs2 += v * v; vn++; }
  const varyans = Math.max(1, vs2 / vn - (vs / vn) ** 2);

  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  // Aday kaynak (kaynak px) temiz bölgede tamamen içeride mi?
  const temiz = (sx: number, sy: number) => {
    if (sx < 0 || sy < 0 || sx + B > w || sy + B > h) return false;
    const x0 = Math.floor(sx / o), y0 = Math.floor(sy / o), x1 = Math.min(aw, Math.ceil((sx + B) / o)), y1 = Math.min(ah, Math.ceil((sy + B) / o));
    if (x1 - x0 < 1 || y1 - y0 < 1) return false;
    return boxSum(IS, aw, x0, y0, x1, y1) >= (x1 - x0) * (y1 - y0);
  };
  // Kaynak sınırlayıcı kutusu (analiz px).
  let bx0 = aw, by0 = ah, bx1 = 0, by1 = 0;
  for (let y = 0; y < ah; y++) for (let x = 0; x < aw; x++) if (S.d[y * aw + x]) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
  // Keskinlik (adım 0 blok haritası, analiz koordinatında blokAn px): kaynak bloğun ortalama ince
  // ölçek enerjisi. HEDEF keskinlik: gerçek kumaşın (tamamen bilinen bloklar) keskinliği dışa yayılmış
  // alan — dolgu, komşu gerçek kumaşla aynı netlikte olur (bulanık kenara net kopya konmaz, tersi de).
  const kesHar = ctx.keskinlik;
  const keskinlik = (sx: number, sy: number): number => {
    if (!kesHar) return 1;
    const km = kesHar.map, ba = kesHar.blokAn;
    const x0 = Math.max(0, Math.min(km.w - 1, Math.floor(sx / o / ba))), x1 = Math.max(x0, Math.min(km.w - 1, Math.floor((sx + B - 1) / o / ba)));
    const y0 = Math.max(0, Math.min(km.h - 1, Math.floor(sy / o / ba))), y1 = Math.max(y0, Math.min(km.h - 1, Math.floor((sy + B - 1) / o / ba)));
    let s = 0, c = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { s += km.d[y * km.w + x]; c++; }
    return c ? s / c : 0;
  };
  let hedefKes: ((ax: number, ay: number) => number) | null = null;
  if (kesHar) {
    const km = kesHar.map, ba = kesHar.blokAn;
    const IGer = integral(gercek, aw, ah);
    const kesAn = new Float32Array(aw * ah), bilKes = new Uint8Array(aw * ah);
    for (let by = 0; by < km.h; by++)
      for (let bx = 0; bx < km.w; bx++) {
        const x0 = Math.floor(bx * ba), y0 = Math.floor(by * ba), x1 = Math.min(aw, Math.floor((bx + 1) * ba)), y1 = Math.min(ah, Math.floor((by + 1) * ba));
        if (x1 <= x0 || y1 <= y0) continue;
        const tam = boxSum(IGer, aw, x0, y0, x1, y1) >= (x1 - x0) * (y1 - y0);
        if (!tam) continue;
        const v = km.d[by * km.w + bx];
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { kesAn[y * aw + x] = v; bilKes[y * aw + x] = 1; }
      }
    hedefKes = hedefAlani(kesAn, bilKes, aw, ah, B / o);
  }
  if (p.keskinlikModu !== 'eslesme') hedefKes = null;
  const KES_TABAN = 0.5;
  const kesOrani = (sx: number, sy: number, dx: number, dy: number) => {
    if (!hedefKes) return 1;
    const hedef = Math.max(KES_TABAN, hedefKes((dx + B / 2) / o, (dy + B / 2) / o));
    return Math.max(KES_TABAN, keskinlik(sx, sy)) / hedef;
  };
  // 'en_keskin' kipi (yalnız kalibrasyon/test; eski davranış): temiz bölgedeki blokların keskinlik
  // dağılımında %70 yüzdelik altı adaylar elenir, kalanlar keskinlikle ağırlıklanır.
  let kesEsik = 0, kesP75 = 1;
  if (kesHar && p.keskinlikModu === 'en_keskin') {
    const ks: number[] = [];
    const adimK = Math.max(8, Math.round(B / 2));
    for (let sy = Math.round(by0 * o); sy + B <= h; sy += adimK) for (let sx = Math.round(bx0 * o); sx + B <= w; sx += adimK) if (temiz(sx, sy)) ks.push(keskinlik(sx, sy));
    if (ks.length >= 4) { const arr = Float32Array.from(ks); kesEsik = percentile(arr, 0.7); kesP75 = Math.max(1e-6, percentile(arr, 0.75)); }
  }
  let keskinlikKosulu = !!hedefKes || (!!kesHar && p.keskinlikModu === 'en_keskin'); // aday bulunamazsa gevşetilir
  const gecerli = (sx: number, sy: number, dx: number, dy: number) => {
    if (!temiz(sx, sy)) return false;
    if (!keskinlikKosulu) return true;
    if (p.keskinlikModu === 'en_keskin') return keskinlik(sx, sy) >= kesEsik;
    const r = kesOrani(sx, sy, dx, dy);
    return r >= 1 / p.keskinlikBant && r <= p.keskinlikBant;
  };
  const netAgirlik = (sx: number, sy: number, dx: number, dy: number) => {
    if (p.keskinlikModu === 'en_keskin') return kesHar ? 1 + p.keskinlikAgirlik * (1 - Math.min(1, keskinlik(sx, sy) / kesP75)) : 1;
    return hedefKes ? 1 + p.keskinlikAgirlik * Math.min(3, Math.abs(Math.log2(kesOrani(sx, sy, dx, dy)))) : 1;
  };
  // Faz kilidi: periyot ölçülmüşse öteleme (kaynak − hedef) iki eksende periyodun tam katına yuvarlanır.
  const fazKilidi = (sx: number, sy: number, dx: number, dy: number): [number, number] => {
    if (!kafes || !p.fazKilidi) return [sx, sy];
    return [dx + Math.round((sx - dx) / kafes[0]) * kafes[0], dy + Math.round((sy - dy) / kafes[1]) * kafes[1]];
  };
  const rastgeleAday = (dx: number, dy: number): [number, number] | null => {
    for (let t = 0; t < 20; t++) {
      const [sx, sy] = fazKilidi(Math.round((bx0 + rnd() * Math.max(0, bx1 - bx0 - Ban)) * o), Math.round((by0 + rnd() * Math.max(0, by1 - by0 - Ban)) * o), dx, dy);
      if (gecerli(sx, sy, dx, dy)) return [sx, sy];
    }
    return null;
  };
  // Yakın aday: hedefin kaynak kutusuna en yakın noktası çevresinde (σ ≈ blok). Perspektif/ışık eğimi
  // nedeniyle ilmek ölçeği ve parlaklık en çok yakın bölgede benzer.
  const gaussRnd = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const yakinAday = (dx: number, dy: number): [number, number] | null => {
    const px = Math.max(bx0 * o, Math.min((bx1 - Ban) * o, dx)), py = Math.max(by0 * o, Math.min((by1 - Ban) * o, dy));
    for (let t = 0; t < 20; t++) {
      const [sx, sy] = fazKilidi(Math.round(px + gaussRnd() * B * p.yakinSigma), Math.round(py + gaussRnd() * B * p.yakinSigma), dx, dy);
      if (gecerli(sx, sy, dx, dy)) return [sx, sy];
    }
    return null;
  };
  const kisa = Math.min(w, h);
  // Hata: hedef blok alanındaki bilinen analiz piksellerinde tuval ile kaynak farkı (kare, RGB ort.;
  // 2'şer atlayarak). Kaynak, ton hedefine kanal başına skaler kazançla (doğrusal; sRGB'de ≈ g^(1/2.2))
  // eşitlendikten sonra ölçülür: aday seçimi ışık eğimine değil dokuya göre olur ve kopyalanan blok
  // çevresindeki gerçek kumaşın tonunu taşır (kazanç yalnız KOPYALANAN piksellere; maske içi
  // kumaşa dokunmaz).
  const hata = (dx: number, dy: number, sx: number, sy: number): [number, number, [number, number, number]] => {
    const ax0 = Math.ceil(dx / o), ay0 = Math.ceil(dy / o), ax1 = Math.min(aw, Math.floor((dx + B) / o)), ay1 = Math.min(ah, Math.floor((dy + B) / o));
    const ox = (sx - dx) / o, oy = (sy - dy) / o;
    const g = kazancPlan(dx, dy, sx, sy);
    const gs = [g[0] ** (1 / 2.2), g[1] ** (1 / 2.2), g[2] ** (1 / 2.2)];
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
        const d0 = tuval[i * 3] - gs[0] * img[j * 3], d1 = tuval[i * 3 + 1] - gs[1] * img[j * 3 + 1], d2 = tuval[i * 3 + 2] - gs[2] * img[j * 3 + 2];
        s += d0 * d0 + d1 * d1 + d2 * d2;
        n++;
      }
    }
    return [n ? s / (3 * n) : 0, n, g];
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
  const ilk = rastgeleAday(0, 0) ?? [Math.round(sq.x * o), Math.round(sq.y * o)];
  // Katmanlı sıra: her turda bilinen piksele değen bloklar (bilinen sayısı en yüksek önce), sonra yenile.
  while (kalan.length) {
    const IBk = integral(bilinen, aw, ah);
    const puanli = kalan.map((k) => { const [x0, y0, x1, y1] = anRect(xs[k.gx], ys[k.gy]); return { ...k, b: boxSum(IBk, aw, x0, y0, x1, y1) }; });
    let katman = puanli.filter((k) => k.b > 0);
    if (!katman.length) katman = puanli; // yalıtılmış ada: kör yerleştir
    katman.sort((a, b) => b.b - a.b || a.gy - b.gy || a.gx - b.gx);
    const katmanSet = new Set(katman.map((k) => `${k.gx},${k.gy}`));
    kalan = kalan.filter((k) => !katmanSet.has(`${k.gx},${k.gy}`));
    for (const { gx, gy } of katman) {
      const dx = xs[gx], dy = ys[gy];
      const adaylar: [number, number][] = [];
      const devamSet = new Set<string>();
      const devam = (k: Yerlesim | undefined) => {
        if (!k) return;
        const cx = k.sx + (dx - k.dx), cy = k.sy + (dy - k.dy);
        const kaymalar: [number, number][] = [[0, 0]];
        if (kafes) for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) if (a || b) kaymalar.push([a * kafes[0], b * kafes[1]]);
        for (const [kx, ky] of kaymalar) if (gecerli(cx + kx, cy + ky, dx, dy)) { adaylar.push([cx + kx, cy + ky]); if (!kx && !ky) devamSet.add(`${cx},${cy}`); }
      };
      devam(grid.get(`${gx - 1},${gy}`));
      devam(grid.get(`${gx + 1},${gy}`));
      devam(grid.get(`${gx},${gy - 1}`));
      devam(grid.get(`${gx},${gy + 1}`));
      for (let t = 0; t < p.adaySayisi; t++) { const a = t % 2 ? rastgeleAday(dx, dy) : yakinAday(dx, dy); if (a) adaylar.push(a); }
      if (!adaylar.length && keskinlikKosulu) {
        // Keskinlik bandını tutturan aday yok (kaynak küçük / tek düze): bant gevşetilir, yalnız ağırlık kalır.
        keskinlikKosulu = false;
        for (let t = 0; t < p.adaySayisi; t++) { const a = t % 2 ? rastgeleAday(dx, dy) : yakinAday(dx, dy); if (a) adaylar.push(a); }
      }
      if (!adaylar.length) adaylar.push(ilk);
      let best = adaylar[0], bestE = Infinity, bestHam = 0, bestN = 0, bestG: [number, number, number] = [1, 1, 1];
      for (const [sx, sy] of adaylar) {
        const [e, n, g] = hata(dx, dy, sx, sy);
        // Mesafe cezası: aynı hatada yakın kaynak yeğlenir. Keskinlik ağırlığı: hedefe en yakın netlik
        // yeğlenir (ne daha keskin ne daha yumuşak). Devam indirimi: komşunun şeridini sürdüren aday yeğlenir.
        const ceza = 1 + p.mesafeCezasi * (Math.hypot(sx - dx, sy - dy) / kisa);
        const net = netAgirlik(sx, sy, dx, dy);
        const devamK = devamSet.has(`${sx},${sy}`) ? p.devamIndirimi : 1;
        const ec = (e + varyans * 0.01) * ceza * net * devamK;
        if (ec < bestE) { bestE = ec; bestHam = e; bestN = n; bestG = g; best = [sx, sy]; }
        if (n === 0) break; // bilinen piksel yok: ilk aday
      }
      const y: Yerlesim = { gx, gy, dx, dy, sx: best[0], sy: best[1], hata: bestHam, bilinen: bestN, kazanc: bestG };
      yerlesim.push(y);
      grid.set(`${gx},${gy}`, y);
      // Planlama tuvalini güncelle: doldurulacak (W<0.5) analiz pikselleri kaynaktan (kazançla) kopyalanır, blok alanı bilinir.
      const ax0 = Math.ceil(dx / o), ay0 = Math.ceil(dy / o), ax1 = Math.min(aw, Math.floor((dx + B) / o)), ay1 = Math.min(ah, Math.floor((dy + B) / o));
      const ox = (best[0] - dx) / o, oy = (best[1] - dy) / o;
      const gs = [bestG[0] ** (1 / 2.2), bestG[1] ** (1 / 2.2), bestG[2] ** (1 / 2.2)];
      for (let yy = ay0; yy < ay1; yy++) {
        const sy2 = Math.max(0, Math.min(ah - 1, Math.round(yy + oy)));
        for (let xx = ax0; xx < ax1; xx++) {
          const i = yy * aw + xx;
          if (W[i] < 0.5) {
            const j = sy2 * aw + Math.max(0, Math.min(aw - 1, Math.round(xx + ox)));
            for (let c = 0; c < 3; c++) tuval[i * 3 + c] = Math.max(0, Math.min(255, Math.round(gs[c] * img[j * 3 + c])));
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
    kafes_x: kf ? kf.px : null,
    kafes_y: kf ? kf.py : null,
    kafes_kor_x: kf ? kf.kx : null,
    kafes_kor_y: kf ? kf.ky : null,
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
  const dikisHaritasi = new Uint8Array(w * h); // ek belirginlik ölçümü için dikiş yolları
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
  // Blok başına kanal kazancı (yalnız KOPYALANAN piksellere; doğrusal ışıkta skaler): işlenmiş karede
  // gerçek kumaşın (W ≥ 1) doğrusal RGB hedef alanı / kaynak bloğun doğrusal kanal ortalaması.
  // Işık eğimi (doz sınırı nedeniyle tam düzleşmez) boyunca farklı yükseklikten alınan kopyalar
  // çevresindeki gerçek kumaşın tonuna oturur; dikey/yatay tonlama şeridi ve yama görünümü kalmaz.
  const LINv = LINa;
  const RIsl = new Float32Array(aw * ah), GIsl = new Float32Array(aw * ah), BIsl = new Float32Array(aw * ah), sayIsl = new Float32Array(aw * ah);
  // Atlamasız toplama: ölçek küçükken (≈1,5) atlamalı örnekleme bazı analiz hücrelerini boş (0) bırakıp
  // hedefi karartıyordu (kazanç alt sınıra yapışıyordu). Örneksiz hücre bilinen sayılmaz.
  for (let y = 0; y < h; y++) {
    const ay = Math.min(ah - 1, Math.floor(y / o));
    for (let x = 0; x < w; x++) {
      const j = ay * aw + Math.min(aw - 1, Math.floor(x / o)), k = (y * w + x) * 3;
      RIsl[j] += LINv[isl[k]]; GIsl[j] += LINv[isl[k + 1]]; BIsl[j] += LINv[isl[k + 2]];
      sayIsl[j] += 1;
    }
  }
  const gercekIsl = new Uint8Array(aw * ah);
  for (let i = 0; i < aw * ah; i++) if (sayIsl[i]) { RIsl[i] /= sayIsl[i]; GIsl[i] /= sayIsl[i]; BIsl[i] /= sayIsl[i]; gercekIsl[i] = gercek[i]; }
  const hedefIsl = rgbHedefi(RIsl, GIsl, BIsl, gercekIsl, aw, ah, B / o);
  const lut = [new Uint8Array(256), new Uint8Array(256), new Uint8Array(256)];
  const blokKazanci = (dx: number, dy: number, sx: number, sy: number): [number, number, number] => {
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let v = 0; v < B; v += 4)
      for (let u = 0; u < B; u += 4) {
        const ks = ((sy + v) * w + sx + u) * 3;
        sr += LINv[isl[ks]]; sg += LINv[isl[ks + 1]]; sb += LINv[isl[ks + 2]];
        n++;
      }
    if (!n) return [1, 1, 1];
    return kanalKazanci(hedefIsl((dx + B / 2) / o, (dy + B / 2) / o), [sr / n, sg / n, sb / n], p);
  };
  const lutKur = (g: [number, number, number]) => { for (let c = 0; c < 3; c++) for (let v = 0; v < 256; v++) lut[c][v] = Math.round(Math.max(0, Math.min(255, linearToSrgb(LINv[v] * g[c])))); };
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
        if (bilinenTam[i]) {
          var_ = true;
          const ks = ((sy + bv) * w + sx + bu) * 3;
          maliyet[v * M + u] = (lum(out, i * 3) - (0.299 * lut[0][isl[ks]] + 0.587 * lut[1][isl[ks + 1]] + 0.114 * lut[2][isl[ks + 2]])) ** 2;
        } else maliyet[v * M + u] = 0;
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
  const dikisIsaretle = (x: number, y: number) => {
    for (let t = -1; t <= 1; t++) {
      if (x + t >= 0 && x + t < w) dikisHaritasi[y * w + x + t] = 1;
      if (y + t >= 0 && y + t < h) dikisHaritasi[(y + t) * w + x] = 1;
    }
  };
  let kazancMin = Infinity, kazancMax = -Infinity;
  for (const y of yerlesim) {
    const { dx, dy, sx, sy } = y;
    const g = blokKazanci(dx, dy, sx, sy);
    const gY = 0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2];
    if (gY < kazancMin) kazancMin = gY;
    if (gY > kazancMax) kazancMax = gY;
    lutKur(g);
    const yollar = [kes(dx, dy, sx, sy, 0), kes(dx, dy, sx, sy, 1), kes(dx, dy, sx, sy, 2), kes(dx, dy, sx, sy, 3)];
    // Dikiş yolları (yalnız bilinen tarafta anlamlı) haritaya.
    for (let v = 0; v < B; v++) {
      if (yollar[0] && bilinenTam[(dy + v) * w + dx + yollar[0][v]]) dikisIsaretle(dx + yollar[0][v], dy + v);
      if (yollar[2] && bilinenTam[(dy + v) * w + dx + B - 1 - yollar[2][v]]) dikisIsaretle(dx + B - 1 - yollar[2][v], dy + v);
    }
    for (let u = 0; u < B; u++) {
      if (yollar[1] && bilinenTam[(dy + yollar[1][u]) * w + dx + u]) dikisIsaretle(dx + u, dy + yollar[1][u]);
      if (yollar[3] && bilinenTam[(dy + B - 1 - yollar[3][u]) * w + dx + u]) dikisIsaretle(dx + u, dy + B - 1 - yollar[3][u]);
    }
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
        if (wgt >= 1) { out[k] = lut[0][isl[ks]]; out[k + 1] = lut[1][isl[ks + 1]]; out[k + 2] = lut[2][isl[ks + 2]]; }
        else for (let c = 0; c < 3; c++) out[k + c] = Math.round(out[k + c] * (1 - wgt) + lut[c][isl[ks + c]] * wgt);
      }
    }
    for (let v = 0; v < B; v++) bilinenTam.fill(1, (dy + v) * w + dx, (dy + v) * w + dx + B);
  }
  // Son birleştirme: maske içi gerçek kumaş bit düzeyinde aynen; m..2m bandında harman (o bant da dikiştir).
  let doluPx = 0;
  for (let i = 0; i < w * h; i++) {
    const wgt = Wtum[i];
    const k = i * 3;
    if (wgt >= 1) { out[k] = isl[k]; out[k + 1] = isl[k + 1]; out[k + 2] = isl[k + 2]; continue; }
    doluPx++;
    if (wgt <= 0) continue;
    dikisHaritasi[i] = 1;
    for (let c = 0; c < 3; c++) out[k + c] = Math.round(isl[k + c] * wgt + out[k + c] * (1 - wgt));
  }
  const oran = doluPx / (w * h);

  // ---- Ek belirginlik kapısı ----
  const ek = ekOlcumu(out, w, h, Wtum, dikisHaritasi, B, O, yerlesim, periyot, kafes, p.ekOlcek);
  const ekOlcumKaydi = Object.fromEntries(Object.entries(ek).map(([k, v]) => ['ek_' + k, v])) as Record<string, number>;
  const asan = ekKapisi(ek, p);
  if (asan.length)
    return atla(
      'ek_belirgin',
      `Dolgu ekleri görünür kalırdı (${asan.join(', ')}; eşikler: dikiş ${p.ekDikisEsigi}, ton ${p.ekTonEsigi}, keskinlik ${p.ekKeskinlikEsigi}, yama ton ${p.ekYamaTonEsigi}, yama doku ${p.ekYamaDokuEsigi}); orijinal kadraj olduğu gibi bırakıldı`,
      true,
      { ...olcumOrtak, ...ekOlcumKaydi, ek_asan: asan.join(','), sure_ms: Date.now() - t0 }
    );

  ctx.olcumler.doldurulan_oran = +oran.toFixed(4);
  ctx.uyarilar.push('kenar_kumasla_tamamlandi');
  log(ctx, {
    adim: 'kenar_doldurma',
    risk: 'dikkat',
    durum: 'uygulandi',
    not: `Kumaş dışı %${(oran * 100).toFixed(1)} alan, kumaşın kendi pikselleri 1:1 kopyalanarak dolduruldu (üretken işlem yok; ${B} px blok, ${O} px örtüşme, ${periyot ? 'periyoda kilitli öteleme, ' : ''}en küçük hatalı dikiş; kopyalara blok başına ton kazancı ${kazancMin.toFixed(2)}–${kazancMax.toFixed(2)}; ek belirginlik kapısı geçildi: dikiş ${ek.dikis_orani}, ton ${ek.ton_farki}, keskinlik ${ek.sinir_keskinlik}, yama ton ${ek.yama_ton_orani}, yama doku ${ek.yama_doku_orani})`,
    olcum: {
      ...olcumOrtak,
      doldurulan_oran: +oran.toFixed(4),
      kazanc_min: +kazancMin.toFixed(3),
      kazanc_max: +kazancMax.toFixed(3),
      keskinlik_kosulu: keskinlikKosulu,
      ...ekOlcumKaydi,
      sure_ms: Date.now() - t0,
    },
  });
  return { uygulandi: true, out };
}
