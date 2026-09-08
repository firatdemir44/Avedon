import { Router } from 'express';
import { prisma } from '../db';
import { createProductSchema, updateProductSchema } from '../validation';

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

productsRouter.get('/:id', async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product) {
    return res.status(404).json({ error: 'product_not_found' });
  }
  res.json({ product });
});

productsRouter.patch('/:id', async (req, res) => {
  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: 'product_not_found' });
  }

  const product = await prisma.product.update({ where: { id: req.params.id }, data: parsed.data });
  res.json({ product });
});

productsRouter.delete('/:id', async (req, res) => {
  const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: 'product_not_found' });
  }

  await prisma.sampleRequest.deleteMany({ where: { productId: req.params.id } });
  await prisma.product.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
