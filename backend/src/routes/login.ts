import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';

export const loginRouter = Router();

const loginSchema = z.object({ phone: z.string().min(10) });

loginRouter.post('/', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const user = await prisma.user.findUnique({
    where: { phone: parsed.data.phone },
    include: { company: true },
  });
  if (!user) {
    return res.status(404).json({ error: 'user_not_found' });
  }

  res.json({ user });
});
