import { z } from 'zod/v4';

// Görünüm kartı (Faz 3, Adım 3): fotoğraftan YALNIZCA görünen özellikler. Gramaj, lif,
// örgü yapısı fotoğraftan okunmaz ve burada yer almaz (dürüstlük sınırı).
// Başlıklar Fırat kararı (2026-09-18): desen, ölçek, renk, yüzey, doku, şeffaflık.
type Option = { key: string; label: string };
const keys = <T extends readonly Option[]>(list: T) => list.map((o) => o.key) as [string, ...string[]];

export const LOOK_PATTERNS = [
  { key: 'duz', label: 'Düz (desensiz)' },
  { key: 'cizgili', label: 'Çizgili' },
  { key: 'kareli', label: 'Kareli / ekose' },
  { key: 'puantiye', label: 'Puantiye' },
  { key: 'cicekli', label: 'Çiçekli' },
  { key: 'geometrik', label: 'Geometrik' },
  { key: 'hayvan', label: 'Hayvan deseni' },
  { key: 'etnik', label: 'Etnik / şal deseni' },
  { key: 'soyut', label: 'Soyut' },
  { key: 'motifli', label: 'Motifli (jakar / dantel motifi)' },
  { key: 'kamuflaj', label: 'Kamuflaj' },
  { key: 'batik', label: 'Batik / degrade' },
  { key: 'yazili', label: 'Yazı / logo' },
  { key: 'melanj', label: 'Melanj / kırçıllı' },
  { key: 'diger', label: 'Diğer' },
] as const satisfies readonly Option[];

export const LOOK_SCALES = [
  { key: 'yok', label: 'Desen yok' },
  { key: 'kucuk', label: 'Küçük desen' },
  { key: 'orta', label: 'Orta desen' },
  { key: 'buyuk', label: 'Büyük desen' },
] as const satisfies readonly Option[];

export const LOOK_COLORS = [
  { key: 'beyaz', label: 'Beyaz' },
  { key: 'ekru', label: 'Ekru / krem' },
  { key: 'bej', label: 'Bej' },
  { key: 'sari', label: 'Sarı' },
  { key: 'turuncu', label: 'Turuncu' },
  { key: 'kirmizi', label: 'Kırmızı' },
  { key: 'bordo', label: 'Bordo' },
  { key: 'pembe', label: 'Pembe' },
  { key: 'mor', label: 'Mor' },
  { key: 'lacivert', label: 'Lacivert' },
  { key: 'mavi', label: 'Mavi' },
  { key: 'turkuaz', label: 'Turkuaz' },
  { key: 'yesil', label: 'Yeşil' },
  { key: 'haki', label: 'Haki' },
  { key: 'kahverengi', label: 'Kahverengi' },
  { key: 'gri', label: 'Gri' },
  { key: 'antrasit', label: 'Antrasit' },
  { key: 'siyah', label: 'Siyah' },
  { key: 'metalik', label: 'Metalik / simli' },
] as const satisfies readonly Option[];

export const LOOK_SURFACES = [
  { key: 'mat', label: 'Mat' },
  { key: 'hafif_parlak', label: 'Hafif parlak' },
  { key: 'parlak', label: 'Parlak / saten' },
  { key: 'tuylu', label: 'Tüylü / şardonlu' },
  { key: 'kadifemsi', label: 'Kadifemsi' },
  { key: 'simli', label: 'Simli' },
] as const satisfies readonly Option[];

export const LOOK_TEXTURES = [
  { key: 'duz', label: 'Düz yüzey' },
  { key: 'ribli', label: 'Ribli / fitilli' },
  { key: 'file', label: 'File / ağ' },
  { key: 'tul', label: 'Tül' },
  { key: 'dantel', label: 'Dantel' },
  { key: 'havlu', label: 'Havlu / bukle' },
  { key: 'petek', label: 'Petek / pike' },
  { key: 'krinkil', label: 'Krinkıl / buruşuk' },
  { key: 'kabartma', label: 'Kabartma / jakar dokusu' },
  { key: 'kalin_orgu', label: 'Kalın örgü / triko' },
  { key: 'diyagonal', label: 'Diyagonal (gabardin / denim)' },
  { key: 'diger', label: 'Diğer' },
] as const satisfies readonly Option[];

export const LOOK_TRANSPARENCIES = [
  { key: 'opak', label: 'Opak' },
  { key: 'yari_saydam', label: 'Yarı saydam' },
  { key: 'saydam', label: 'Saydam' },
] as const satisfies readonly Option[];

export const LOOK_OPTIONS = {
  patterns: LOOK_PATTERNS,
  scales: LOOK_SCALES,
  colors: LOOK_COLORS,
  surfaces: LOOK_SURFACES,
  textures: LOOK_TEXTURES,
  transparencies: LOOK_TRANSPARENCIES,
};

export const lookSchema = z.object({
  isFabric: z.boolean().describe('Fotoğrafta kumaş ya da tekstil yüzeyi açıkça görünüyor mu'),
  pattern: z.enum(keys(LOOK_PATTERNS)),
  scale: z.enum(keys(LOOK_SCALES)),
  colors: z.array(z.enum(keys(LOOK_COLORS))).describe('Baskın renk ilk sırada; en çok 3 renk'),
  surface: z.enum(keys(LOOK_SURFACES)),
  texture: z.enum(keys(LOOK_TEXTURES)),
  transparency: z.enum(keys(LOOK_TRANSPARENCIES)),
  confidence: z.number().describe('0-1 arası; fotoğraf bulanık, uzak ya da kumaş dışı nesnelerle doluysa düşük'),
});

export type FabricLook = z.infer<typeof lookSchema>;

const label = (list: readonly Option[], key: string) => list.find((o) => o.key === key)?.label ?? key;

export function describeLook(l: FabricLook): string {
  return [
    label(LOOK_PATTERNS, l.pattern),
    l.scale !== 'yok' && l.pattern !== 'duz' ? label(LOOK_SCALES, l.scale) : '',
    l.colors.map((c) => label(LOOK_COLORS, c)).join(' + '),
    label(LOOK_SURFACES, l.surface),
    l.texture !== 'duz' ? label(LOOK_TEXTURES, l.texture) : '',
    l.transparency !== 'opak' ? label(LOOK_TRANSPARENCIES, l.transparency) : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function parseLook(json: string): FabricLook | null {
  try {
    const parsed = lookSchema.safeParse(JSON.parse(json));
    return parsed.success ? { ...parsed.data, colors: parsed.data.colors.slice(0, 3) } : null;
  } catch {
    return null;
  }
}
