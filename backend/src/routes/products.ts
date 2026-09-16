import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { createProductSchema, updateProductSchema, MAX_PRODUCT_IMAGES } from '../validation';
import { makeHandle } from './handle';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { isValidSubtype, matchCatalogKeys } from '../catalog';
import {
  MAX_RECENT_VIEWS,
  PRODUCT_SELECT,
  ProductImageError,
  buildProductWhere,
  productQuerySchema,
  replaceProductImages,
  serializeUsages,
  toProductRow,
} from '../products';

export const productsRouter = Router();

const handle = makeHandle('products');

const invalidSubtype = { error: 'invalid_body', details: { fieldErrors: { subtype: ['invalid_subtype'] } } };

// Giriş yapmış kullanıcının bu ürünlerden hangilerini favorilediği.
async function favoriteIdsFor(userId: string | undefined, productIds: string[]) {
  if (!userId || productIds.length === 0) return new Set<string>();
  const rows = await prisma.productFavorite.findMany({
    where: { userId, productId: { in: productIds } },
    select: { productId: true },
  });
  return new Set(rows.map((row) => row.productId));
}

productsRouter.get(
  '/',
  optionalAuth,
  handle(async (req, res) => {
    const parsed = productQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_query', details: parsed.error.flatten() });
    }

    const products = await prisma.product.findMany({
      where: buildProductWhere(parsed.data),
      orderBy: { createdAt: 'desc' },
      select: PRODUCT_SELECT,
    });
    const favorites = await favoriteIdsFor(
      req.user?.id,
      products.map((p) => p.id)
    );

    res.json({ products: products.map((p) => ({ ...toProductRow(p), isFavorite: favorites.has(p.id) })) });
  })
);

// Gönderi ekranındaki ürün seçici. Firmanın yüzlerce ürünü olabildiği için
// liste sunucuda aranır ve sayfa sayfa verilir; toplam sayı da dönüyor ki
// ekran "240 üründen ilki" diyebilsin. /:id'den ÖNCE tanımlı olmalı, yoksa
// "mine" bir ürün id'si sanılır.
const mineQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

productsRouter.get(
  '/mine',
  requireAuth,
  handle(async (req, res) => {
    const parsed = mineQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_query', details: parsed.error.flatten() });
    }
    if (!req.user!.companyId) {
      return res.json({ products: [], total: 0 });
    }

    const search = parsed.data.search;
    const matched = search ? matchCatalogKeys(search) : null;
    const where = {
      companyId: req.user!.companyId,
      ...(search
        ? {
            OR: [
              { code: { contains: search } },
              { content: { contains: search } },
              ...(matched!.types.length ? [{ type: { in: matched!.types } }] : []),
              ...(matched!.subtypes.length ? [{ subtype: { in: matched!.subtypes } }] : []),
            ],
          }
        : {}),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        select: { id: true, code: true, type: true, subtype: true, _count: { select: { images: true } } },
        orderBy: { createdAt: 'desc' },
        take: parsed.data.limit ?? 30,
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      products: products.map(({ _count, ...p }) => ({ ...p, hasImage: _count.images > 0 })),
      total,
    });
  })
);

productsRouter.post(
  '/',
  requireAuth,
  handle(async (req, res) => {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    if (!req.user!.companyId) {
      return res.status(403).json({ error: 'no_company' });
    }

    const { images, imageUrl, usages, ...fields } = parsed.data;
    if (!isValidSubtype(fields.type, fields.subtype)) {
      return res.status(400).json(invalidSubtype);
    }
    const imageList = images ?? (imageUrl ? [imageUrl] : []);

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: { ...fields, usages: serializeUsages(usages), companyId: req.user!.companyId! },
        select: { id: true },
      });
      await replaceProductImages(tx, created.id, imageList);
      return tx.product.findUniqueOrThrow({ where: { id: created.id }, select: PRODUCT_SELECT });
    });
    res.status(201).json({ product: { ...toProductRow(product), isFavorite: false } });
  })
);

// Kapak fotoğrafı (ilk sıradaki). Liste küçük resimleri, gönderi ve numune
// ekranları bunu kullanıyor.
productsRouter.get(
  '/:id/image',
  handle(async (req, res) => {
    const image = await prisma.productImage.findFirst({
      where: { productId: req.params.id },
      orderBy: { position: 'asc' },
      select: { imageUrl: true },
    });
    if (image) {
      return res.json({ imageUrl: image.imageUrl });
    }
    const exists = await prisma.product.count({ where: { id: req.params.id } });
    res.status(404).json({ error: exists ? 'image_not_found' : 'product_not_found' });
  })
);

// Galerideki tek fotoğraf.
productsRouter.get(
  '/:id/images/:position',
  handle(async (req, res) => {
    const position = Number(req.params.position);
    if (!Number.isInteger(position) || position < 0 || position >= MAX_PRODUCT_IMAGES) {
      return res.status(404).json({ error: 'image_not_found' });
    }
    const image = await prisma.productImage.findUnique({
      where: { productId_position: { productId: req.params.id, position } },
      select: { imageUrl: true },
    });
    if (!image) {
      return res.status(404).json({ error: 'image_not_found' });
    }
    res.json({ imageUrl: image.imageUrl });
  })
);

// Favoriye ekleme/çıkarma aynı sonucu tekrar tekrar verir (iki kez basmak hata değil).
productsRouter.post(
  '/:id/favorite',
  requireAuth,
  handle(async (req, res) => {
    const exists = await prisma.product.count({ where: { id: req.params.id } });
    if (!exists) {
      return res.status(404).json({ error: 'product_not_found' });
    }
    await prisma.productFavorite.upsert({
      where: { userId_productId: { userId: req.user!.id, productId: req.params.id } },
      create: { userId: req.user!.id, productId: req.params.id },
      update: {},
    });
    res.json({ isFavorite: true });
  })
);

productsRouter.delete(
  '/:id/favorite',
  requireAuth,
  handle(async (req, res) => {
    await prisma.productFavorite.deleteMany({ where: { userId: req.user!.id, productId: req.params.id } });
    res.json({ isFavorite: false });
  })
);

productsRouter.get(
  '/:id',
  optionalAuth,
  handle(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: PRODUCT_SELECT,
    });
    if (!product) {
      return res.status(404).json({ error: 'product_not_found' });
    }

    // Tasarımdaki "Toplam N Ürün" rozeti — firmanın kataloğunun büyüklüğü
    // üreticiye duyulan güvenin göstergesi olarak ürün sayfasında duruyor.
    const companyProductCount = await prisma.product.count({
      where: { companyId: product.companyId },
    });

    const user = req.user;
    let isFavorite = false;
    if (user) {
      isFavorite = (await favoriteIdsFor(user.id, [product.id])).has(product.id);
      // "Son bakılanlar": kendi firmasının ürünleri kaydedilmez. Kayıt başarısız
      // olsa bile ürün sayfası açılmalı.
      if (user.companyId !== product.companyId) {
        try {
          await prisma.productView.upsert({
            where: { userId_productId: { userId: user.id, productId: product.id } },
            create: { userId: user.id, productId: product.id },
            update: { viewedAt: new Date() },
          });
          const stale = await prisma.productView.findMany({
            where: { userId: user.id },
            orderBy: { viewedAt: 'desc' },
            skip: MAX_RECENT_VIEWS,
            select: { id: true },
          });
          if (stale.length) {
            await prisma.productView.deleteMany({ where: { id: { in: stale.map((v) => v.id) } } });
          }
        } catch (err) {
          console.error('[products] son bakılan kaydedilemedi', err);
        }
      }
    }

    res.json({ product: { ...toProductRow(product), companyProductCount, isFavorite } });
  })
);

productsRouter.patch(
  '/:id',
  requireAuth,
  handle(async (req, res) => {
    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    }

    const existing = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: { companyId: true, type: true, subtype: true },
    });
    if (!existing) {
      return res.status(404).json({ error: 'product_not_found' });
    }
    if (existing.companyId !== req.user!.companyId) {
      return res.status(403).json({ error: 'not_your_company' });
    }

    const { images, imageUrl, usages, subtype, ...fields } = parsed.data;
    const nextType = fields.type ?? existing.type;
    // Çeşit değişip alt çeşit gönderilmediyse eski alt çeşit yeni çeşide ait
    // olmayacağı için boşaltılır.
    const nextSubtype = subtype ?? (fields.type && fields.type !== existing.type ? '' : existing.subtype);
    if (!isValidSubtype(nextType as Parameters<typeof isValidSubtype>[0], nextSubtype)) {
      return res.status(400).json(invalidSubtype);
    }
    const imageList = images ?? (imageUrl === null ? [] : imageUrl ? [imageUrl] : undefined);

    try {
      const product = await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: req.params.id },
          data: {
            ...fields,
            subtype: nextSubtype,
            ...(usages ? { usages: serializeUsages(usages) } : {}),
          },
        });
        if (imageList) await replaceProductImages(tx, req.params.id, imageList);
        return tx.product.findUniqueOrThrow({ where: { id: req.params.id }, select: PRODUCT_SELECT });
      });
      const isFavorite = (await favoriteIdsFor(req.user!.id, [product.id])).has(product.id);
      res.json({ product: { ...toProductRow(product), isFavorite } });
    } catch (err) {
      if (err instanceof ProductImageError) {
        return res.status(400).json({ error: 'invalid_body', details: { fieldErrors: { images: [err.message] } } });
      }
      throw err;
    }
  })
);

productsRouter.delete(
  '/:id',
  requireAuth,
  handle(async (req, res) => {
    const existing = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: { companyId: true },
    });
    if (!existing) {
      return res.status(404).json({ error: 'product_not_found' });
    }
    if (existing.companyId !== req.user!.companyId) {
      return res.status(403).json({ error: 'not_your_company' });
    }

    // Numune talepleri ürüne zorunlu bağlı; önce onlar (ve olay geçmişleri
    // cascade ile) siliniyor. Fotoğraflar, favoriler ve son bakılan kayıtları
    // şemada cascade ile ürünle birlikte gidiyor.
    await prisma.sampleRequest.deleteMany({ where: { productId: req.params.id } });
    await prisma.product.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
