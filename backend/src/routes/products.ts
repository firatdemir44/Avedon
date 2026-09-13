import { Router } from 'express';
import { prisma } from '../db';
import { createProductSchema, updateProductSchema } from '../validation';
import { makeHandle } from './handle';
import { requireAuth } from '../middleware/auth';
import { PRODUCT_SELECT, toProductRow } from '../products';

export const productsRouter = Router();

const handle = makeHandle('products');

productsRouter.get(
  '/',
  handle(async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const products = await prisma.product.findMany({
      where: search
        ? {
            OR: [
              { code: { contains: search } },
              { content: { contains: search } },
              { useArea: { contains: search } },
              { type: { contains: search } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      select: PRODUCT_SELECT,
    });

    res.json({ products: products.map(toProductRow) });
  })
);

// Gönderi oluştururken ürün seçici için hafif liste. /:id'den ÖNCE tanımlı
// olmalı, yoksa "mine" bir ürün id'si sanılır.
productsRouter.get(
  '/mine',
  requireAuth,
  handle(async (req, res) => {
    if (!req.user!.companyId) {
      return res.json({ products: [] });
    }
    const products = await prisma.product.findMany({
      where: { companyId: req.user!.companyId },
      select: { id: true, code: true, type: true },
      orderBy: { code: 'asc' },
    });
    res.json({ products });
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

    const product = await prisma.product.create({
      data: { ...parsed.data, companyId: req.user!.companyId },
      select: PRODUCT_SELECT,
    });
    res.status(201).json({ product: toProductRow(product) });
  })
);

// Fotoğraf ayrı uçtan: liste/detay yanıtları hafif kalsın diye (bkz. products.ts).
productsRouter.get(
  '/:id/image',
  handle(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: { imageUrl: true },
    });
    if (!product) {
      return res.status(404).json({ error: 'product_not_found' });
    }
    if (!product.imageUrl) {
      return res.status(404).json({ error: 'image_not_found' });
    }
    res.json({ imageUrl: product.imageUrl });
  })
);

productsRouter.get(
  '/:id',
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

    res.json({ product: { ...toProductRow(product), companyProductCount } });
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
      select: { companyId: true },
    });
    if (!existing) {
      return res.status(404).json({ error: 'product_not_found' });
    }
    if (existing.companyId !== req.user!.companyId) {
      return res.status(403).json({ error: 'not_your_company' });
    }

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: parsed.data,
      select: PRODUCT_SELECT,
    });
    res.json({ product: toProductRow(product) });
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
    // cascade ile) siliniyor.
    await prisma.sampleRequest.deleteMany({ where: { productId: req.params.id } });
    await prisma.product.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
