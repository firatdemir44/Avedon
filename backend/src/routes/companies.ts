import { Router } from 'express';
import { prisma } from '../db';
import { makeHandle } from './handle';
import { PRODUCT_SELECT, toProductRow } from '../products';

export const companiesRouter = Router();

const handle = makeHandle('companies');

companiesRouter.get(
  '/',
  handle(async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    if (!search) {
      return res.json({ companies: [] });
    }
    const companies = await prisma.company.findMany({
      where: { name: { contains: search } },
      orderBy: { name: 'asc' },
      take: 10,
    });
    res.json({ companies });
  })
);

companiesRouter.get(
  '/:id',
  handle(async (req, res) => {
    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      include: {
        // Ürün fotoğrafları burada da dönmüyor: bir firmanın tüm kataloğu tek
        // yanıtta geldiği için en çok şişen yer burasıydı (bkz. src/products.ts).
        products: { select: PRODUCT_SELECT, orderBy: { createdAt: 'desc' } },
        users: { select: { id: true, firstName: true, lastName: true, position: true } },
      },
    });
    if (!company) {
      return res.status(404).json({ error: 'company_not_found' });
    }
    res.json({ company: { ...company, products: company.products.map(toProductRow) } });
  })
);
