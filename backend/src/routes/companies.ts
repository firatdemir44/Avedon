import { Router } from 'express';
import { prisma } from '../db';

export const companiesRouter = Router();

companiesRouter.get('/', async (req, res) => {
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
});

companiesRouter.get('/:id', async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { id: req.params.id },
    include: {
      products: true,
      users: { select: { id: true, firstName: true, lastName: true, position: true } },
    },
  });
  if (!company) {
    return res.status(404).json({ error: 'company_not_found' });
  }
  res.json({ company });
});
