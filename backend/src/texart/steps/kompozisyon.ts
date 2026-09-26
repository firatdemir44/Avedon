// Adım 9 — Kompozisyon (Güvenli). Nötr standart zemin, sabit kenar boşluğu, sabit çıktı boyutu.
// Kumaş piksellerine dokunmaz: işlenmiş kare kırpım tuvale yerleştirilir.
// Yarı saydam kumaş (tül, dantel, file): kumaş dokusunun arasından zemin görünüyorsa (yakın plan
// kırpımında zemin rengine yakın piksel payı) zemin değiştirme görünümü değiştirir → uyarı eklenir;
// Faz 1'de katalog kırpımı kumaşın içinden alındığı için zemin zaten orijinaldir.

import sharp from 'sharp';
import { deltaE2000, rgbToLab } from './renk';
import { log, type Ctx } from './tip';

export type KompozisyonParams = { boyut: number; kenar: number; zemin: { r: number; g: number; b: number }; saydamDE: number; saydamOran: number; ayrimDE: number };
export const KOMPOZISYON: KompozisyonParams = { boyut: 1024, kenar: 64, zemin: { r: 237, g: 235, b: 231 }, saydamDE: 8, saydamOran: 0.04, ayrimDE: 15 };

/** Yakın plan (ham, yerel piksel) kırpımında zemin rengine yakın piksel payı → yarı saydamlık. */
export function yariSaydamTespiti(ctx: Ctx, ham: Uint8Array, w: number, h: number, p: KompozisyonParams = KOMPOZISYON): { yariSaydam: boolean; oran: number | null } {
  const seg = ctx.seg!;
  if (!seg.zemin) return { yariSaydam: false, oran: null };
  const ayrim = Math.min(...seg.kumasLab.map((k) => deltaE2000(k, seg.zemin!.lab)));
  if (ayrim < p.ayrimDE) return { yariSaydam: false, oran: null };
  const step = Math.max(1, Math.floor((w * h) / 20_000));
  let n = 0, hit = 0;
  for (let i = 0; i < w * h; i += step) {
    const lab = rgbToLab(ham[i * 3], ham[i * 3 + 1], ham[i * 3 + 2]);
    if (deltaE2000(lab, seg.zemin.lab) < p.saydamDE) hit++;
    n++;
  }
  const oran = n ? hit / n : 0;
  return { yariSaydam: oran >= p.saydamOran, oran };
}

export function kompozisyon(ctx: Ctx, saydam: { yariSaydam: boolean; oran: number | null }, p: KompozisyonParams = KOMPOZISYON) {
  const guvenDusuk = ctx.seg!.guven < 0.5;
  const orijinal = saydam.yariSaydam || guvenDusuk;
  ctx.kompozisyon = { zemin: orijinal ? 'orijinal' : 'notr', kesme: false };
  if (saydam.yariSaydam) ctx.uyarilar.push('yari_saydam_zemin_korundu');
  else if (guvenDusuk) ctx.uyarilar.push('maske_guveni_dusuk');
  log(ctx, {
    adim: 'kompozisyon',
    risk: 'guvenli',
    durum: 'uygulandi',
    not: `${p.boyut}×${p.boyut}, ${p.kenar} px kenar boşluğu, nötr zemin; kırpım kumaşın içinden (kesme yok)${
      saydam.yariSaydam ? '; kumaş yarı saydam: zemin değiştirilmedi, uyarı eklendi' : guvenDusuk ? '; maske güveni düşük: uyarı eklendi' : ''
    }`,
    olcum: { zemin: ctx.kompozisyon.zemin, saydamlik_orani: saydam.oran === null ? null : +saydam.oran.toFixed(3), maske_guveni: ctx.seg!.guven },
  });
}

/** Kare kırpımı tuvale yerleştirir ve JPEG üretir. */
export async function tuval(crop: Uint8Array, cropSide: number, boyut: number, p: KompozisyonParams = KOMPOZISYON): Promise<Buffer> {
  const kenar = Math.round((p.kenar * boyut) / p.boyut);
  const icerik = boyut - 2 * kenar;
  let img = sharp(Buffer.from(crop.buffer, crop.byteOffset, crop.byteLength), { raw: { width: cropSide, height: cropSide, channels: 3 } });
  if (cropSide !== icerik) img = img.resize(icerik, icerik, { kernel: 'lanczos3', fit: 'fill' });
  const inner = await img.png().toBuffer();
  return sharp({ create: { width: boyut, height: boyut, channels: 3, background: p.zemin } })
    .composite([{ input: inner, left: kenar, top: kenar }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
