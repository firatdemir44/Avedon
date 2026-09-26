// Adım 0 — Giriş kalite kapısı. Eşik altındaysa işleme yapılmaz, firmaya yeniden çekim mesajı döner.
//  Bulanıklık: uzun kenarı ≤ 2048 px kopyada blok blok "ince ölçek enerjisi" (L − gauss(L,1))²;
//    en net %10 bloğun enerjisi bile eşiğin altındaysa fotoğraf bulanıktır (kumaşın bir yerinde
//    mutlaka doku vardır; düz kumaşta bile ilmek görünür). Aynı blok haritası adım 5'te en net
//    bölgeyi seçmek için kullanılır.
//  Parlama: patlamış piksel oranı VE en büyük patlamış bölge. Simli/saten kumaşın noktasal
//    parıltıları aşındırmayla elenir; yalnız geniş patlamış alan reddedilir.
//  Karanlık: parlaklık medyanı ve %99 yüzdeliği birlikte düşükse (siyah kumaş tek başına
//    medyanla reddedilmez: %99 yüzdeliği zemin/doku parlaklığını taşır).
//  Alan / düz bölge: maske sonrası (kaliteAlan).

import { components, gauss, largestSquare, luma, morph, percentile, plane, type Mask, type Plane } from './goruntu';
import { log, type Ctx } from './tip';

export type KaliteParams = {
  keskinlikKenar: number; // keskinlik kopyası uzun kenarı (px)
  blok: number; // blok boyu (keskinlik kopyasında px)
  inceMin: number; // %90 yüzdelik ince enerji bunun altındaysa bulanık
  yumusakMin: number; // bunun altındaysa "yumuşak odak" uyarısı (ret yok)
  patlamaEsigi: number; // kanal değeri (0..255)
  patlamaOran: number; // kadrajın bu oranından fazlası patlamışsa
  patlamaBolge: number; // tek bir patlamış bölge kadrajın bu oranını aşarsa
  karanlikMedyan: number; // parlaklık medyanı (0..255) bunun altında VE
  karanlikUst: number; // %99 yüzdelik bunun altındaysa karanlık
  alanMin: number; // kumaş / kadraj alan oranı
  duzBolgeMin: number; // en büyük kare kenarı / kısa kenar
};

export const KALITE: KaliteParams = {
  keskinlikKenar: 2048,
  blok: 64,
  inceMin: 7,
  yumusakMin: 20,
  patlamaEsigi: 250,
  patlamaOran: 0.06,
  patlamaBolge: 0.02,
  karanlikMedyan: 28,
  karanlikUst: 70,
  alanMin: 0.12,
  duzBolgeMin: 0.28,
};

/** Keskinlik blok haritası: analiz koordinatlarında blok boyu `blokAn` px; değer = ince ölçek enerjisi. */
export type Keskinlik = { map: Plane; blokAn: number; p90: number; p50: number };

export type KaliteOlcum = { ince_p50: number; ince_p90: number; patlama_oran: number; patlama_bolge: number; medyan: number; p99: number };

export async function keskinlikHaritasi(ctx: Ctx, p: KaliteParams = KALITE): Promise<Keskinlik> {
  const { data, info } = await (await ctx.an.kaynakSharp())
    .resize(p.keskinlikKenar, p.keskinlikKenar, { fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const L = luma({ w: info.width, h: info.height, d: data });
  const g1 = gauss(L, 1);
  const B = p.blok;
  const bw = Math.max(1, Math.floor(L.w / B)), bh = Math.max(1, Math.floor(L.h / B));
  const map = plane(bw, bh);
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      let s = 0, n = 0;
      for (let y = by * B; y < Math.min(L.h, (by + 1) * B); y++)
        for (let x = bx * B; x < Math.min(L.w, (bx + 1) * B); x++) {
          const d = L.d[y * L.w + x] - g1.d[y * L.w + x];
          s += d * d;
          n++;
        }
      map.d[by * bw + bx] = n ? s / n : 0;
    }
  const blokAn = (B * ctx.an.img.w) / info.width;
  return { map, blokAn, p90: percentile(map.d, 0.9), p50: percentile(map.d, 0.5) };
}

/** Kalite kapısı, bölüm 1 (maske öncesi): bulanıklık, parlama, karanlık. Sorun varsa kodunu döner. */
export async function kaliteOn(ctx: Ctx, p: KaliteParams = KALITE): Promise<{ kod: string | null; olcum: KaliteOlcum; keskinlik: Keskinlik }> {
  const { an } = ctx;
  const keskinlik = await keskinlikHaritasi(ctx, p);
  const { img } = an;
  const n = img.w * img.h;
  const clip: Mask = { w: img.w, h: img.h, d: new Uint8Array(n) };
  let nClip = 0;
  for (let i = 0; i < n; i++) {
    if (img.d[i * 3] >= p.patlamaEsigi && img.d[i * 3 + 1] >= p.patlamaEsigi && img.d[i * 3 + 2] >= p.patlamaEsigi) (clip.d[i] = 1), nClip++;
  }
  const er = morph(clip, Math.max(1, Math.round(img.w / 400)), true);
  const { areas } = components(er);
  const bolge = areas.length > 1 ? Math.max(...areas.slice(1)) / n : 0;
  const medyan = percentile(an.L.d, 0.5), p99 = percentile(an.L.d, 0.99);
  const olcum: KaliteOlcum = {
    ince_p50: +keskinlik.p50.toFixed(1),
    ince_p90: +keskinlik.p90.toFixed(1),
    patlama_oran: +(nClip / n).toFixed(4),
    patlama_bolge: +bolge.toFixed(4),
    medyan: +medyan.toFixed(0),
    p99: +p99.toFixed(0),
  };
  let kod: string | null = null;
  if (keskinlik.p90 < p.inceMin) kod = 'bulanik';
  else if (nClip / n > p.patlamaOran && bolge > p.patlamaBolge) kod = 'parlama';
  else if (medyan < p.karanlikMedyan && p99 < p.karanlikUst) kod = 'karanlik';
  if (!kod && keskinlik.p90 < p.yumusakMin) ctx.uyarilar.push('yumusak_odak');
  ctx.olcumler.keskinlik_ince_p90 = olcum.ince_p90;
  ctx.olcumler.patlama_oran = olcum.patlama_oran;
  log(ctx, {
    adim: 'kalite_kapisi',
    risk: null,
    durum: kod ? 'atlandi' : 'bilgi',
    not: kod ? `Yeniden çekim: ${kod}` : keskinlik.p90 < p.yumusakMin ? 'Eşikler geçildi; odak yumuşak (uyarı)' : 'Bulanıklık, parlama ve karanlık eşikleri geçildi',
    olcum,
  });
  return { kod, olcum, keskinlik };
}

/** Kalite kapısı, bölüm 2 (maske sonrası): kumaşın kadrajdaki alanı ve düz bölge varlığı. */
export function kaliteAlan(ctx: Ctx, p: KaliteParams = KALITE): string | null {
  const seg = ctx.seg!;
  const sq = largestSquare(seg.mask);
  const kisa = Math.min(seg.mask.w, seg.mask.h);
  const duz = sq.side / kisa;
  let kod: string | null = null;
  if (seg.alanOrani < p.alanMin) kod = 'kumas_kucuk';
  else if (duz < p.duzBolgeMin) kod = 'duz_bolge_yok';
  ctx.olcumler.kumas_alan_orani = +seg.alanOrani.toFixed(3);
  log(ctx, {
    adim: 'kalite_kapisi_alan',
    risk: null,
    durum: kod ? 'atlandi' : 'bilgi',
    not: kod ? `Yeniden çekim: ${kod}` : 'Kumaş alanı ve düz bölge yeterli',
    olcum: { alan_orani: +seg.alanOrani.toFixed(3), en_buyuk_kare: +duz.toFixed(2) },
  });
  return kod;
}
