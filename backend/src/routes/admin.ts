import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';

export const adminRouter = Router();

async function requireAdmin(adminUserId: unknown): Promise<boolean> {
  if (typeof adminUserId !== 'string') return false;
  const user = await prisma.user.findUnique({ where: { id: adminUserId } });
  return !!user?.isAdmin;
}

adminRouter.get('/companies', async (req, res) => {
  const isAdmin = await requireAdmin(req.query.adminUserId);
  if (!isAdmin) {
    return res.status(403).json({ error: 'not_admin' });
  }

  const companies = await prisma.company.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { users: true, products: true } } },
  });
  res.json({ companies });
});

const updateVerificationSchema = z.object({
  adminUserId: z.string().min(1),
  verification: z.enum(['dogrulanmamis', 'inceleniyor', 'dogrulanmis']),
});

adminRouter.patch('/companies/:id/verification', async (req, res) => {
  const parsed = updateVerificationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const isAdmin = await requireAdmin(parsed.data.adminUserId);
  if (!isAdmin) {
    return res.status(403).json({ error: 'not_admin' });
  }

  const company = await prisma.company.update({
    where: { id: req.params.id },
    data: { verification: parsed.data.verification },
  });
  res.json({ company });
});
