import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { STOCK_UNITS, USAGE_KEYS, matchCatalogKeys } from './catalog';
import { productTypeSchema } from './validation';
import { WIDTH_TYPES, isValidCertificate, isValidFiber, knitSearchKeys } from './domain/glossary';
import { PASSPORT_LIST_SELECT, toPassportRow } from './passport';
import { effectiveWidthCm } from './domain/calc/wastage';
import { YARN_PRODUCT_TYPE, YARN_SPEC_SELECT, toYarnSpecRow } from './yarns';

// Ürün fotoğrafları ProductImage tablosunda (base64 data URL). LİSTE ve DETAY
// yanıtlarında ASLA dönmez — katalog büyüdükçe tek bir liste isteği megabaytlara
// çıkardı. Yanıtlar imageCount/hasImage diyor; istemci kapak için
// GET /api/products/:id/image, galeri için GET /api/products/:id/images/:position
// ile fotoğrafları tek tek çekip önbelleğe alıyor. Gönderi fotoğraflarında da
// aynı kural geçerli (bkz. src/posts.ts). Sertifika/test raporu belgeleri de
// aynı kuralla ayrı uçtan gelir (passport.ts).
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
  ...PASSPORT_LIST_SELECT,
  // İplik ürünlerinde (type = "iplik") dolu; kumaşta null.
  yarnSpec: { select: YARN_SPEC_SELECT },
  // fieldMeta sayısı: onay bekleyen (confirmedAt boş) alanlar.
  _count: { select: { images: true, fieldMeta: { where: { confirmedAt: null } } } },
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

// viewerCompanyId: fiyat yalnızca ürünün sahibi firmaya döner. Verilmezse
// (oturumsuz ya da firmasız kullanıcı) fiyat hiç yazılmaz.
export function toProductRow(row: ProductRow, viewerCompanyId?: string | null) {
  const {
    _count,
    usages,
    widthType,
    widthMeaning,
    moq,
    moqUnit,
    leadTimeDays,
    priceValue,
    priceCurrency,
    priceUnit,
    finishTags,
    passportUpdatedAt,
    originCountry,
    careNotes,
    careSymbols,
    recycledPercent,
    compositions,
    certificates,
    yarnSpec,
    ...product
  } = row;
  return {
    ...product,
    // Hesapta kullanılacak açık en: tek yüz tüp eni verildiyse iki katı.
    effectiveWidthCm: effectiveWidthCm(product.widthCm, widthMeaning === 'tup_tek_yuz' ? 'tup_tek_yuz' : 'acik'),
    usages: parseUsages(usages),
    imageCount: _count.images,
    hasImage: _count.images > 0,
    yarn: toYarnSpecRow(yarnSpec),
    ...toPassportRow(
      {
        widthType,
        widthMeaning,
        moq,
        moqUnit,
        leadTimeDays,
        priceValue,
        priceCurrency,
        priceUnit,
        finishTags,
        passportUpdatedAt,
        originCountry,
        careNotes,
        careSymbols,
        recycledPercent,
        compositions,
        certificates,
      },
      { viewerCompanyId, ownerCompanyId: row.companyId, pendingFieldCount: _count.fieldMeta }
    ),
  };
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

// GET /api/products filtreleri (tasarımdaki "Filtreleme Seçenekleri" + pasaport).
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
  // Pasaport filtreleri (Faz 1, Adım 2)
  // Virgülle ayrılmış lif anahtarları; herhangi birini içeren ürün gelir.
  fiber: z.string().max(300).optional(),
  // fiber ile birlikte: o lif en az bu oranda olsun (ör. elastan ≥ 5).
  fiberMinPercent: optionalNumber,
  // Virgülle ayrılmış sertifika anahtarları.
  certificate: z.string().max(300).optional(),
  moqMax: optionalNumber,
  leadTimeMax: optionalNumber,
  widthType: z.enum(WIDTH_TYPES).optional(),
});

export type ProductQuery = z.infer<typeof productQuerySchema>;

// usages JSON metninde anahtar tırnaklarıyla aranıyor: "astar" araması
// "astarlik" alt çeşidine değil yalnızca "astar" kullanım amacına uyar.
const usageContains = (key: string): Prisma.ProductWhereInput => ({ usages: { contains: `"${key}"` } });

export function buildProductWhere(query: ProductQuery): Prisma.ProductWhereInput {
  // Kumaş kataloğu: iplikler ayrı dizinde (/api/yarns) listelenir.
  const and: Prisma.ProductWhereInput[] = [{ type: { not: YARN_PRODUCT_TYPE } }];

  if (query.search) {
    const search = query.search;
    // Etiket metni (matchCatalogKeys) + sözlük eşanlamlıları (knitSearchKeys):
    // "single jersey" araması suprem alt çeşidini bulur (Faz 1, Adım 1).
    const catalog = matchCatalogKeys(search);
    const glossary = knitSearchKeys(search);
    const matched = {
      types: [...new Set([...catalog.types, ...glossary.types])],
      subtypes: [...new Set([...catalog.subtypes, ...glossary.subtypes])],
      usages: catalog.usages,
    };
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

  // Pasaport filtreleri: kompozisyon ve sertifika ayrı tablolarda; ilişki
  // süzgeci ("bu lif şu oranın üstünde") JSON metinle mümkün olmazdı.
  if (query.fiber) {
    const fibers = query.fiber.split(',').filter(isValidFiber);
    if (fibers.length) {
      and.push({
        compositions: {
          some: {
            fiber: { in: fibers },
            ...(query.fiberMinPercent !== undefined ? { percent: { gte: query.fiberMinPercent } } : {}),
          },
        },
      });
    }
  }
  if (query.certificate) {
    const names = query.certificate.split(',').filter(isValidCertificate);
    if (names.length) and.push({ certificates: { some: { name: { in: names } } } });
  }
  if (query.moqMax !== undefined) and.push({ moq: { lte: query.moqMax } });
  if (query.leadTimeMax !== undefined) and.push({ leadTimeDays: { lte: query.leadTimeMax } });
  if (query.widthType) and.push({ widthType: query.widthType });

  return { AND: and };
}

// Kullanıcı başına tutulan "son bakılan" kaydı; eskiler budanır.
export const MAX_RECENT_VIEWS = 50;

// Kural (Fırat 2026-09-24): katalog ve aramalarda STOKTA olan ürünler her zaman önce gelir,
// ardından diğer kaliteler; her grubun kendi içindeki sıra (ör. en yeni) korunur (kararlı sıralama).
export function stockFirst<T extends { stock?: number | null }>(rows: T[]): T[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => Number((b.r.stock ?? 0) > 0) - Number((a.r.stock ?? 0) > 0) || a.i - b.i)
    .map((x) => x.r);
}
// Sınırlı (take) sorgularda: önce stoklu, sonra en yeni.
export const STOCK_FIRST_ORDER = [{ stock: 'desc' as const }, { createdAt: 'desc' as const }];
