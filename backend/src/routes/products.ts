import { Router } from 'express';
import { prisma } from '../db';
import { createProductSchema } from '../validation';

export const productsRouter = Router();

productsRouter.get('/', async (req, res) => {
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
  });

  res.json({ products });
});

productsRouter.post('/', async (req, res) => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const company = await prisma.company.findUnique({ where: { id: parsed.data.companyId } });
  if (!company) {
    return res.status(404).json({ error: 'company_not_found' });
  }

  const product = await prisma.product.create({ data: parsed.data });
  res.status(201).json({ product });
});
