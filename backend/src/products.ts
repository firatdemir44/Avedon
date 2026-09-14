import { Prisma } from '@prisma/client';

// Ürün fotoğrafı base64 data URL olarak String sütunda duruyor (bkz.
// schema.prisma). LİSTE ve DETAY yanıtlarında ASLA dönmez — katalog büyüdükçe
// tek bir liste isteği megabaytlara çıkardı. Yanıtlar hasImage diyor, istemci
// GET /api/products/:id/image ile fotoğrafı tek tek çekip önbelleğe alıyor.
// Gönderi fotoğraflarında da aynı kural geçerli (bkz. src/posts.ts).
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
  stock: true,
  weightGsm: true,
  widthCm: true,
  content: true,
  useArea: true,
  imageUrl: true,
  createdAt: true,
  company: { select: PRODUCT_COMPANY_SELECT },
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

// imageUrl'i açıkça ayırıyoruz: kalan alanlar yayılınca fotoğrafın yanıta
// yanlışlıkla sızması mümkün olmuyor.
export function toProductRow({ imageUrl, ...product }: ProductRow) {
  return { ...product, hasImage: !!imageUrl };
}
