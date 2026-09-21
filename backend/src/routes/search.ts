import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { optionalAuth } from '../middleware/auth';
import { PRODUCT_SELECT, buildProductWhere, toProductRow } from '../products';
import { buildYarnWhere } from '../yarns';
import { makeHandle } from './handle';

// Üst başlıktaki "Arama Yap" kutusu (Fırat 2026-09-21): tek kutudan firma, kumaş ve iplik.
// Her gruptan az sayıda sonuç döner; "tümünü gör" ilgili listeye (ürünler / iplik dizini) gider.
// Kumaş ve iplik araması mevcut süzgeç mantığını kullanır (eşanlamlılar: "single jersey" → süprem).
export const searchRouter = Router();
const handle = makeHandle('search');

const querySchema = z.object({ q: z.string().trim().min(2).max(100), limit: z.coerce.number().int().min(1).max(10).optional() });

searchRouter.get(
  '/',
  optionalAuth,
  handle(async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_query' });
    const { q } = parsed.data;
    const limit = parsed.data.limit ?? 5;
    const viewerCompanyId = req.user?.companyId ?? null;

    const [companies, fabrics, yarns] = await Promise.all([
      prisma.company.findMany({
        where: { OR: [{ name: { contains: q } }, { city: { contains: q } }, { companyType: { contains: q } }] },
        select: { id: true, name: true, city: true, companyType: true, verification: true, logoUpdatedAt: true, _count: { select: { products: true } } },
        orderBy: { name: 'asc' },
        take: 40,
      }),
      prisma.product.findMany({ where: buildProductWhere({ search: q }), select: PRODUCT_SELECT, orderBy: { createdAt: 'desc' }, take: limit + 1 }),
      prisma.product.findMany({ where: buildYarnWhere({ search: q }), select: PRODUCT_SELECT, orderBy: { createdAt: 'desc' }, take: limit + 1 }),
    ]);

    res.json({
      query: q,
      // Doğrulanmış firmalar öne (metin sıralaması 'dogrulanmamis' < 'dogrulanmis' olduğu için JS'te).
      companies: { items: [...companies].sort((a, b) => Number(b.verification === 'dogrulanmis') - Number(a.verification === 'dogrulanmis')).slice(0, limit).map(({ _count, ...c }) => ({ ...c, productCount: _count.products })), hasMore: companies.length > limit },
      fabrics: { items: fabrics.slice(0, limit).map((p) => toProductRow(p, viewerCompanyId)), hasMore: fabrics.length > limit },
      yarns: { items: yarns.slice(0, limit).map((p) => toProductRow(p, viewerCompanyId)), hasMore: yarns.length > limit },
    });
  })
);
