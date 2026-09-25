import sharp from 'sharp';

// Texart işleme hattı (TEXART.md §3). KIRMIZI ÇİZGİ (§1): kumaş piksellerine üretken yapay zekâ
// uygulanmaz; renk/ışık düzeltmeleri yalnızca global. Her adım ayrı, ayarlanabilir bir modüldür ve
// ne yaptığını işlem kaydına yazar. Bu dosya saf işlevdir (veritabanı/disk yok): test komutu ve iş
// kuyruğu aynı hattı çalıştırır.

export type Risk = 'guvenli' | 'dikkat' | 'riskli';

export type LogEntry = {
  adim: string;
  risk: Risk | null;
  durum: 'uygulandi' | 'atlandi' | 'bilgi';
  doz?: number;
  not?: string;
  olcum?: Record<string, number | string | boolean | null>;
};

export type ColorChip = { hex: string; ad: string; oran: number };

export type PipelineOutputs = { katalog: Buffer; katalog_2x?: Buffer; yakin_plan: Buffer; renk_cipi: Buffer };

export type PipelineResult =
  | { durum: 'yeniden_cekim'; uyarilar: string[]; islem_kaydi: LogEntry[]; olcumler: Record<string, unknown> }
  | {
      durum: 'tamam';
      ciktilar: PipelineOutputs;
      renkler: ColorChip[];
      olcumler: Record<string, unknown>;
      uyarilar: string[];
      islem_kaydi: LogEntry[];
      boyut: { width: number; height: number };
    };

export const CATALOG_SIZE = 1024;

/**
 * Faz 1 / Adım 1: iskelet. Görsel çözülür, EXIF yönü uygulanır, çıktı dosyaları standart boyutta
 * üretilir; işleme adımları (0–9) sonraki adımlarda bu hatta sırayla eklenecek.
 */
export async function runPipeline(input: Buffer): Promise<PipelineResult> {
  const log: LogEntry[] = [];
  const meta = await sharp(input).metadata();
  const { data, info } = await sharp(input, { failOn: 'error' })
    .rotate()
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  log.push({ adim: 'giris', risk: null, durum: 'bilgi', olcum: { genislik: info.width, yukseklik: info.height, bicim: meta.format ?? null } });
  log.push({ adim: 'hat', risk: null, durum: 'bilgi', not: 'İşleme adımları henüz etkin değil (Faz 1 Adım 1 iskelet); çıktılar orijinalden yalnızca kırpılıp boyutlandırıldı.' });

  const fromRaw = () => sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } });
  const katalog = await fromRaw().resize(CATALOG_SIZE, CATALOG_SIZE, { fit: 'cover', kernel: 'lanczos3' }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const side = Math.min(info.width, info.height, CATALOG_SIZE);
  const yakin = await fromRaw()
    .extract({ left: Math.floor((info.width - side) / 2), top: Math.floor((info.height - side) / 2), width: side, height: side })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
  const { dominant } = await fromRaw().stats();
  const hex = '#' + [dominant.r, dominant.g, dominant.b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  const chip = await sharp({ create: { width: 256, height: 256, channels: 3, background: { r: dominant.r, g: dominant.g, b: dominant.b } } }).png().toBuffer();

  return {
    durum: 'tamam',
    ciktilar: { katalog, yakin_plan: yakin, renk_cipi: chip },
    renkler: [{ hex, ad: '', oran: 1 }],
    olcumler: {},
    uyarilar: ['iskelet_hat'],
    islem_kaydi: log,
    boyut: { width: info.width, height: info.height },
  };
}
