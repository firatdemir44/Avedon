// Adım 8 — Çözünürlük (Riskli → sınırlı). Katalog içeriği 896 px (1024 çıktı, 64 px kenar);
// kaynak kırpım kenarı bundan küçükse en fazla 2× Lanczos büyütme; daha küçükse büyütme yerine
// yeniden çekim istenir. 2048 çıktı (1792 içerik) yalnız kaynak ≥ 896 px ise üretilir.

import { log, type Ctx } from './tip';

export type CozunurlukParams = { icerik: number; enCokBuyutme: number };
export const COZUNURLUK: CozunurlukParams = { icerik: 896, enCokBuyutme: 2 };

export function cozunurluk(ctx: Ctx, p: CozunurlukParams = COZUNURLUK): string | null {
  const kaynakKenar = ctx.kirpim!.side * ctx.an.olcek;
  const olcek = p.icerik / kaynakKenar;
  const ikiKat = (2 * p.icerik) / kaynakKenar <= p.enCokBuyutme;
  ctx.olcumler.kaynak_kirpim_px = Math.round(kaynakKenar);
  ctx.olcumler.buyutme = +olcek.toFixed(2);
  if (olcek > p.enCokBuyutme) {
    log(ctx, {
      adim: 'cozunurluk',
      risk: 'riskli',
      durum: 'atlandi',
      not: `Kaynak kırpım ${Math.round(kaynakKenar)} px; ${p.icerik} px için ${olcek.toFixed(2)}× büyütme gerekir (> ${p.enCokBuyutme}×) → yeniden çekim`,
      olcum: { kaynak_kenar: Math.round(kaynakKenar), gereken_buyutme: +olcek.toFixed(2) },
    });
    return 'cozunurluk_dusuk';
  }
  ctx.cozunurluk = { ikiKat, olcek };
  log(ctx, {
    adim: 'cozunurluk',
    risk: olcek > 1 ? 'riskli' : 'guvenli',
    durum: 'uygulandi',
    doz: +Math.max(1, olcek).toFixed(2),
    not: olcek > 1 ? `Lanczos ${olcek.toFixed(2)}× büyütme (sınır ${p.enCokBuyutme}×)${ikiKat ? '' : '; 2048 çıktı üretilmedi (kaynak yetersiz)'}` : `Küçültme ${(1 / olcek).toFixed(2)}×; 2048 çıktı ${ikiKat ? 'üretildi' : 'üretilmedi (kaynak < 896 px)'}`,
    olcum: { kaynak_kenar: Math.round(kaynakKenar), olcek: +olcek.toFixed(3), iki_kat: ikiKat },
  });
  return null;
}
