import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAdminAuth } from '../middleware/auth';

export const adminRouter = Router();

adminRouter.use(requireAdminAuth);

adminRouter.get('/companies', async (_req, res) => {
  const companies = await prisma.company.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { users: true, products: true } } },
  });
  res.json({ companies });
});

const updateVerificationSchema = z.object({
  verification: z.enum(['dogrulanmamis', 'inceleniyor', 'dogrulanmis']),
});

adminRouter.patch('/companies/:id/verification', async (req, res) => {
  const parsed = updateVerificationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const company = await prisma.company.update({
    where: { id: req.params.id },
    data: { verification: parsed.data.verification },
  });
  res.json({ company });
});
