// Texart işleme hattı (TEXART.md §3). KIRMIZI ÇİZGİ (§1): kumaş piksellerine üretken yapay zekâ
// uygulanmaz; renk/ışık düzeltmeleri yalnızca global. Her adım ayrı, ayarlanabilir bir modüldür
// (steps/*.ts) ve ne yaptığını işlem kaydına yazar. Bu dosya saf işlevdir (veritabanı/disk yok):
// test komutu ve iş kuyruğu aynı hattı çalıştırır.
//
// Akış: analiz kopyası (≤1024) üzerinde ölçüm ve karar; tam çözünürlük kaynaktan tek geçişte
// örnekleme (geometri + global piksel işlemleri) → katalog / yakın plan / renk çipi.
// Sadakat ölçümleri (§4) hesaplanır ve kayda girer; eşik/geri düşme mantığı KOMUT.md Adım 4'te.

import sharp from 'sharp';
import { loadAnalysis } from './steps/analiz';
import { ayirma } from './steps/ayirma';
import { beyaz } from './steps/beyaz';
import { cozunurluk } from './steps/cozunurluk';
import { doku } from './steps/doku';
import { DOLDURMA, kenarDoldurma, type DoldurmaParams } from './steps/doldurma';
import { duzBolgeLog, enIyiPencere, kirisikHaritasi } from './steps/duzBolge';
import { largestSquare } from './steps/goruntu';
import { isik } from './steps/isik';
import { kaliteAlan, kaliteOn } from './steps/kalite';
import { KOMPOZISYON, kompozisyon, tuval, yariSaydamTespiti } from './steps/kompozisyon';
import { olcek } from './steps/olcek';
import { sadakat } from './steps/olcumler';
import { perspektif } from './steps/perspektif';
import { keskinlestir, renderKirpim, renderTamKare } from './steps/render';
import { cipGorseli, renkler, type ColorChip } from './steps/renkCipi';
import { IDENTITY, YENIDEN_CEKIM_MESAJ, log, type Ctx, type LogEntry, type Risk } from './steps/tip';

export type { Risk, LogEntry, ColorChip };
export { YENIDEN_CEKIM_MESAJ };

export type PipelineOutputs = { katalog: Buffer; katalog_2x?: Buffer; yakin_plan: Buffer; renk_cipi: Buffer };

export type PipelineResult =
  | { durum: 'yeniden_cekim'; neden: string; mesaj: string; uyarilar: string[]; islem_kaydi: LogEntry[]; olcumler: Record<string, unknown> }
  | {
      durum: 'tamam';
      ciktilar: PipelineOutputs;
      renkler: ColorChip[];
      olcumler: Record<string, unknown>;
      uyarilar: string[];
      islem_kaydi: LogEntry[];
      boyut: { width: number; height: number };
    };

export const CATALOG_SIZE = KOMPOZISYON.boyut;
export const CATALOG_CONTENT = KOMPOZISYON.boyut - 2 * KOMPOZISYON.kenar; // 896
export const YAKIN_PLAN = 1024;

function yenidenCekim(ctx: Ctx, kod: string): PipelineResult {
  const mesaj = YENIDEN_CEKIM_MESAJ[kod] ?? 'Fotoğraf işlenemedi, lütfen tekrar çekin';
  ctx.olcumler.yeniden_cekim_nedeni = kod;
  ctx.olcumler.mesaj = mesaj;
  ctx.uyarilar.push(`yeniden_cekim:${kod}`);
  log(ctx, { adim: 'sonuc', risk: null, durum: 'bilgi', not: mesaj });
  return { durum: 'yeniden_cekim', neden: kod, mesaj, uyarilar: ctx.uyarilar, islem_kaydi: ctx.log, olcumler: ctx.olcumler };
}

export type PipelineOptions = {
  /** Adım 10 kenar doldurma (varsayılan açık; test/karşılaştırma için kapatılabilir). */
  doldurma?: boolean;
  /** Adım 10 parametrelerinin üstüne yazma (yalnız test/kalibrasyon). */
  doldurmaParams?: Partial<DoldurmaParams>;
};

export async function runPipeline(input: Buffer, opts: PipelineOptions = {}): Promise<PipelineResult> {
  const t0 = Date.now();
  const { an, format } = await loadAnalysis(input);
  const ctx: Ctx = { log: [], uyarilar: [], olcumler: {}, an, H: IDENTITY };
  log(ctx, { adim: 'giris', risk: null, durum: 'bilgi', olcum: { genislik: an.kaynak.w, yukseklik: an.kaynak.h, bicim: format, analiz_genislik: an.img.w, analiz_yukseklik: an.img.h } });

  // 0) Kalite kapısı (bulanıklık, parlama, karanlık)
  const k0 = await kaliteOn(ctx);
  ctx.keskinlik = k0.keskinlik;
  if (k0.kod) return yenidenCekim(ctx, k0.kod);

  // 1) Kumaşı ayırma + kalite kapısı (alan, düz bölge)
  ctx.seg = ayirma(ctx);
  const k1 = kaliteAlan(ctx);
  if (k1) return yenidenCekim(ctx, k1);

  // 2) Açı / perspektif — KAPALI (Fırat 2026-09-26): orijinal kadraj ve boyut korunur; geometri değişmez.
  void perspektif;
  ctx.rmask = ctx.seg.mask;
  log(ctx, { adim: 'perspektif', risk: 'guvenli', durum: 'atlandi', not: 'Orijinal kadraj korunur (döndürme/düzeltme yok)' });

  // 3) Işık dengeleme, 4) Beyaz dengesi (yalnız karar; uygulama render'da)
  isik(ctx);
  beyaz(ctx);

  // 5) En düz / en net bölge — varsayılan kenar: rektifiye maskede en büyük kare
  const har = kirisikHaritasi(ctx);
  const sq = largestSquare(ctx.rmask!);
  if (sq.side < 8) return yenidenCekim(ctx, 'duz_bolge_yok');
  let pencere = enIyiPencere(ctx, har, sq.side) ?? { x: sq.x, y: sq.y, side: sq.side, puan: 0, kirisik: 1, keskinlik: 0 };
  duzBolgeLog(ctx, har, pencere, 'kumaşı dolduran kare');

  // 7) Ölçek normalizasyonu (deneysel) — kenar küçülürse pencere yeniden seçilir
  // 7) Ölçek normalizasyonu — KAPALI (Fırat 2026-09-26): görüntü gerçek ölçeğinden büyütülmez/yakınlaştırılmaz.
  void olcek;
  log(ctx, { adim: 'olcek', risk: 'dikkat', durum: 'atlandi', not: 'Gerçek ölçek korunur; yakınlaştırma yok' });
  const ol = { side: pencere.side };
  if (ol.side < pencere.side) {
    const yeni = enIyiPencere(ctx, har, ol.side);
    if (yeni) {
      pencere = yeni;
      ctx.log[ctx.log.length - 1].not += `; pencere ${ol.side} px kenarla yeniden seçildi (x ${yeni.x}, y ${yeni.y})`;
    }
  }
  ctx.kirpim = { x: pencere.x, y: pencere.y, side: pencere.side };

  // 6) Doku belirginleştirme dozu
  doku(ctx);

  // 8) Çözünürlük
  const k8 = cozunurluk(ctx);
  if (k8) return yenidenCekim(ctx, k8);

  // Yakın plan: en net bölge, yerel piksel (büyütmesiz), keskinleştirme yok
  const yakinSideAn = Math.min(Math.ceil(YAKIN_PLAN / an.olcek) + 1, sq.side); // kaynakta ≥ 1024 px; küçültme yok, büyütme yok
  const yakinPen = enIyiPencere(ctx, har, yakinSideAn, { kirisik: 0.3, keskinlik: 1 }) ?? pencere;
  ctx.yakinKirpim = { x: yakinPen.x, y: yakinPen.y, side: yakinPen.side };
  const yakinT = Math.min(YAKIN_PLAN, Math.floor(yakinPen.side * an.olcek));
  const yakin = await renderKirpim(ctx, ctx.yakinKirpim, yakinT, { isik: true, wb: true });

  // 9) Kompozisyon kararı (yarı saydamlık yakın plan ham kırpımından)
  const saydam = yariSaydamTespiti(ctx, yakin.ham, yakin.w, yakin.h);
  ctx.seg.yariSaydam = saydam.yariSaydam;
  kompozisyon(ctx, saydam);

  // Render: katalog 1024 (+2048)
  const doz = ctx.keskinlik_doz ?? 0;
  const kat = await renderKirpim(ctx, ctx.kirpim, CATALOG_CONTENT, { isik: true, wb: true });
  const katIsl = await keskinlestir(kat.islenmis, kat.w, kat.h, doz);
  // Katalog görseli: yükleyicinin fotoğrafı AYNI kadraj ve piksel boyutunda; yalnız global ışık/renk ve
  // hafif keskinlik (Fırat 2026-09-26: boyut dışına çıkılırsa sorumluluk bize kalır). Yukarıdaki kırpım
  // yalnız ölçüm (sadakat, renk çipi) içindir.
  void tuval;
  const tam = await renderTamKare(ctx, { isik: true, wb: true });
  // 10) Kenar doldurma (Fırat 2026-09-26): kumaş dışı alanlar kumaşın kendi pikselleri kopyalanarak
  // tamamlanır (üretken işlem yok); global dönüşümlerden SONRA, keskinleştirmeden ÖNCE — böylece kopya
  // kaynağının ışık/renk düzeltmesini taşır, maske içi pikseller doldurmasız render ile birebir aynıdır.
  let tamDolu = tam.islenmis;
  if (opts.doldurma === false) log(ctx, { adim: 'kenar_doldurma', risk: 'dikkat', durum: 'atlandi', not: 'Seçenekle kapatıldı', olcum: { neden: 'kapali' } });
  else tamDolu = (await kenarDoldurma(ctx, tam.islenmis, tam.w, tam.h, { ...DOLDURMA, ...opts.doldurmaParams })).out;
  const tamIsl = await keskinlestir(tamDolu, tam.w, tam.h, doz / 2);
  // JPEG: mozjpeg ama trellis KAPALI — trellis, komşu blokların içeriğine göre nicemleme seçer ve
  // doldurmalı/doldurmasız çıktıda maske İÇİ pikselleri ±7'ye kadar farklılaştırır; kapalıyken
  // maske içi pikseller iki çıktıda bit düzeyinde aynıdır (test: kenar doldurma).
  const katalog = await sharp(Buffer.from(tamIsl.buffer, tamIsl.byteOffset, tamIsl.byteLength), { raw: { width: tam.w, height: tam.h, channels: 3 } })
    .jpeg({ quality: 90, mozjpeg: true, trellisQuantisation: false })
    .toBuffer();
  const katalog_2x: Buffer | undefined = undefined;
  const yakin_plan = await sharp(Buffer.from(yakin.islenmis.buffer, yakin.islenmis.byteOffset, yakin.islenmis.byteLength), { raw: { width: yakin.w, height: yakin.h, channels: 3 } })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  // Renk çipi
  const chips = renkler(katIsl, kat.w, kat.h);
  const renk_cipi = await cipGorseli(chips);
  log(ctx, { adim: 'renk_cipi', risk: null, durum: 'bilgi', not: chips.map((c) => `${c.hex} ${c.ad} (%${Math.round(c.oran * 100)})`).join(' · '), olcum: { renk_sayisi: chips.length } });

  // Sadakat ölçümleri (§4; eşik ve geri düşme Adım 4'te)
  const s = sadakat(kat.ham, katIsl, kat.w, kat.h);
  Object.assign(ctx.olcumler, s);
  an.serbestBirak();
  ctx.olcumler.sure_ms = Date.now() - t0;
  log(ctx, { adim: 'sadakat_olcumu', risk: null, durum: 'bilgi', not: 'Hizalı ham kırpım ile işlenmiş kırpım karşılaştırıldı (eşik denetimi Adım 4)', olcum: { ...s } });

  return {
    durum: 'tamam',
    ciktilar: { katalog, katalog_2x, yakin_plan, renk_cipi },
    renkler: chips,
    olcumler: ctx.olcumler,
    uyarilar: ctx.uyarilar,
    islem_kaydi: ctx.log,
    boyut: { width: an.kaynak.w, height: an.kaynak.h },
  };
}
