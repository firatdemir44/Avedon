import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { STOCK_UNITS, USAGE_KEYS, matchCatalogKeys } from './catalog';
import { productTypeSchema } from './validation';

// Ürün fotoğrafları ProductImage tablosunda (base64 data URL). LİSTE ve DETAY
// yanıtlarında ASLA dönmez — katalog büyüdükçe tek bir liste isteği megabaytlara
// çıkardı. Yanıtlar imageCount/hasImage diyor; istemci kapak için
// GET /api/products/:id/image, galeri için GET /api/products/:id/images/:position
// ile fotoğrafları tek tek çekip önbelleğe alıyor. Gönderi fotoğraflarında da
// aynı kural geçerli (bkz. src/posts.ts).
export const PRODUCT_COMPANY_SELECT = {
  id: true,
  name: true,
  verification: true,
  logoUpdatedAt: true,
} satisfies Prisma.CompanySelect;

export const PRODUCT_SELECT = {
  id: true,
  companyId: true,
  code: true,
  type: true,
  subtype: true,
  usages: true,
  stock: true,
  stockUnit: true,
  weightGsm: true,
  widthCm: true,
  content: true,
  useArea: true,
  createdAt: true,
  company: { select: PRODUCT_COMPANY_SELECT },
  _count: { select: { images: true } },
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

// usages sütunu JSON dizi metni (SQLite'ta dizi tipi yok). Bozuk ya da artık
// katalogda olmayan anahtarlar yanıta konmaz.
export function parseUsages(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((k): k is string => typeof k === 'string' && USAGE_KEYS.has(k)) : [];
  } catch {
    return [];
  }
}

export function serializeUsages(keys: readonly string[]) {
  return JSON.stringify([...new Set(keys)]);
}

export function toProductRow({ _count, usages, ...product }: ProductRow) {
  return { ...product, usages: parseUsages(usages), imageCount: _count.images, hasImage: _count.images > 0 };
}

export class ProductImageError extends Error {}

// Fotoğraf listesini baştan yazar. Öğe ya yeni data URL ya da mevcut bir
// fotoğrafın eski sırası ({ existing }). Sıralar her zaman 0..n-1 sıkışık kalır.
export async function replaceProductImages(
  tx: Prisma.TransactionClient,
  productId: string,
  items: ReadonlyArray<string | { existing: number }>
) {
  const current = await tx.productImage.findMany({
    where: { productId },
    select: { position: true, imageUrl: true },
  });
  const byPosition = new Map(current.map((image) => [image.position, image.imageUrl]));

  const urls = items.map((item) => {
    if (typeof item === 'string') return item;
    const existing = byPosition.get(item.existing);
    if (existing === undefined) throw new ProductImageError('unknown_existing_image');
    return existing;
  });

  await tx.productImage.deleteMany({ where: { productId } });
  if (urls.length > 0) {
    await tx.productImage.createMany({
      data: urls.map((imageUrl, position) => ({ productId, position, imageUrl })),
    });
  }
}

const optionalNumber = z.coerce.number().nonnegative().optional();

// GET /api/products filtreleri (tasarımdaki "Filtreleme Seçenekleri").
export const productQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  type: productTypeSchema.optional(),
  subtype: z.string().trim().max(40).optional(),
  // Virgülle ayrılmış kullanım amaçları; herhangi birine uyan ürün gelir.
  usage: z.string().max(400).optional(),
  stockUnit: z.enum(STOCK_UNITS).optional(),
  stockMin: optionalNumber,
  gsmMin: optionalNumber,
  gsmMax: optionalNumber,
  widthMin: optionalNumber,
  widthMax: optionalNumber,
  content: z.string().trim().max(100).optional(),
  companyId: z.string().trim().max(40).optional(),
});

export type ProductQuery = z.infer<typeof productQuerySchema>;

// usages JSON metninde anahtar tırnaklarıyla aranıyor: "astar" araması
// "astarlik" alt çeşidine değil yalnızca "astar" kullanım amacına uyar.
const usageContains = (key: string): Prisma.ProductWhereInput => ({ usages: { contains: `"${key}"` } });

export function buildProductWhere(query: ProductQuery): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];

  if (query.search) {
    const search = query.search;
    const matched = matchCatalogKeys(search);
    and.push({
      OR: [
        { code: { contains: search } },
        { content: { contains: search } },
        { useArea: { contains: search } },
        { company: { name: { contains: search } } },
        ...(matched.types.length ? [{ type: { in: matched.types } }] : []),
        ...(matched.subtypes.length ? [{ subtype: { in: matched.subtypes } }] : []),
        ...matched.usages.map(usageContains),
      ],
    });
  }

  if (query.type) and.push({ type: query.type });
  if (query.subtype) and.push({ subtype: query.subtype });
  if (query.usage) {
    const keys = query.usage.split(',').filter((key) => USAGE_KEYS.has(key));
    if (keys.length) and.push({ OR: keys.map(usageContains) });
  }
  if (query.stockUnit) and.push({ stockUnit: query.stockUnit });
  if (query.stockMin !== undefined) and.push({ stock: { gte: query.stockMin } });
  if (query.gsmMin !== undefined) and.push({ weightGsm: { gte: query.gsmMin } });
  if (query.gsmMax !== undefined) and.push({ weightGsm: { lte: query.gsmMax } });
  if (query.widthMin !== undefined) and.push({ widthCm: { gte: query.widthMin } });
  if (query.widthMax !== undefined) and.push({ widthCm: { lte: query.widthMax } });
  if (query.content) and.push({ content: { contains: query.content } });
  if (query.companyId) and.push({ companyId: query.companyId });

  return and.length ? { AND: and } : {};
}

// Kullanıcı başına tutulan "son bakılan" kaydı; eskiler budanır.
export const MAX_RECENT_VIEWS = 50;
