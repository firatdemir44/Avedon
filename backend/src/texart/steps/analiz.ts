import sharp from 'sharp';
import { luma, type RGB } from './goruntu';
import type { Analysis } from './tip';

// Analiz kopyası: tüm ölçümler ve maske bu küçük kopyada yapılır; geometrik/global dönüşümler
// tam çözünürlüğe render aşamasında uygulanır (bellek: Render Starter ~512 MB).

export const ANALIZ_UZUN_KENAR = 1024;

/** Tam çözünürlük kaynak bu piksel sayısına kadar bir kez çözülüp bellekte tutulur (15 MP ≈ 45 MB); üstünde her okuma yeniden çözer. */
export const HAM_ONBELLEK_PIKSEL = 20_000_000;

export async function loadAnalysis(input: Buffer): Promise<{ an: Analysis; format: string | null }> {
  const meta = await sharp(input).metadata();
  const swap = (meta.orientation ?? 1) >= 5;
  const kw = swap ? meta.height! : meta.width!, kh = swap ? meta.width! : meta.height!;
  const base = () => sharp(input, { failOn: 'error' }).rotate().removeAlpha().toColourspace('srgb');
  let raw: Buffer | null = null;
  const kaynak = async () => {
    if (kw * kh <= HAM_ONBELLEK_PIKSEL) {
      if (!raw) raw = await base().raw().toBuffer();
      return sharp(raw, { raw: { width: kw, height: kh, channels: 3 } });
    }
    return base();
  };
  const probe = await (await kaynak()).resize(ANALIZ_UZUN_KENAR, ANALIZ_UZUN_KENAR, { fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  const img: RGB = { w: probe.info.width, h: probe.info.height, d: probe.data };
  const an: Analysis = {
    img,
    L: luma(img),
    olcek: kw / img.w,
    kaynak: { w: kw, h: kh },
    kaynakSharp: kaynak,
    oku: async (left, top, width, height, scale = 1) => {
      let s = (await kaynak()).extract({ left, top, width, height });
      if (scale !== 1) s = s.resize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)), { fit: 'fill', kernel: 'lanczos3' });
      const { data, info } = await s.raw().toBuffer({ resolveWithObject: true });
      return { w: info.width, h: info.height, d: data };
    },
    serbestBirak: () => { raw = null; },
  };
  return { an, format: meta.format ?? null };
}

