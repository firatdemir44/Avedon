import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { makeHandle } from './handle';
import { PRODUCT_SELECT, toProductRow } from '../products';

export const meRouter = Router();

const handle = makeHandle('me');

meRouter.get('/', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Favori ürünler, en son eklenen üstte.
meRouter.get(
  '/favorites',
  requireAuth,
  handle(async (req, res) => {
    const favorites = await prisma.productFavorite.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, product: { select: PRODUCT_SELECT } },
    });
    res.json({
      products: favorites.map((f) => ({ ...toProductRow(f.product), isFavorite: true, favoritedAt: f.createdAt })),
    });
  })
);

// Son bakılan ürünler, en son bakılan üstte. Kayıt ürün sayfası açılınca
// tutuluyor (bkz. routes/products.ts GET /:id); kendi firmanın ürünleri yok.
meRouter.get(
  '/recently-viewed',
  requireAuth,
  handle(async (req, res) => {
    const views = await prisma.productView.findMany({
      where: { userId: req.user!.id },
      orderBy: { viewedAt: 'desc' },
      select: { viewedAt: true, product: { select: PRODUCT_SELECT } },
    });
    const favoriteIds = new Set(
      (
        await prisma.productFavorite.findMany({
          where: { userId: req.user!.id, productId: { in: views.map((v) => v.product.id) } },
          select: { productId: true },
        })
      ).map((f) => f.productId)
    );
    res.json({
      products: views.map((v) => ({
        ...toProductRow(v.product),
        isFavorite: favoriteIds.has(v.product.id),
        viewedAt: v.viewedAt,
      })),
    });
  })
);

meRouter.delete(
  '/recently-viewed',
  requireAuth,
  handle(async (req, res) => {
    await prisma.productView.deleteMany({ where: { userId: req.user!.id } });
    res.status(204).send();
  })
);
