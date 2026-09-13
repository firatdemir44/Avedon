import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { getConnectionState } from '../connections';

export const connectionsRouter = Router();
connectionsRouter.use(requireAuth);

const createSchema = z.object({ addresseeId: z.string().min(1) });

connectionsRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }
  const { addresseeId } = parsed.data;

  if (addresseeId === req.user!.id) {
    return res.status(400).json({ error: 'cannot_connect_self' });
  }

  const addressee = await prisma.user.findUnique({ where: { id: addresseeId } });
  if (!addressee) {
    return res.status(404).json({ error: 'addressee_not_found' });
  }

  const state = await getConnectionState(req.user!.id, addresseeId);
  if (state.status !== 'none') {
    return res.status(409).json({ error: 'already_exists', status: state.status });
  }

  try {
    const connection = await prisma.connection.create({
      data: { requesterId: req.user!.id, addresseeId, status: 'pending' },
    });
    res.status(201).json({ connection });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).json({ error: 'already_exists' });
    }
    throw err;
  }
});

const respondSchema = z.object({ status: z.enum(['accepted', 'rejected']) });

connectionsRouter.patch('/:id', async (req, res) => {
  const parsed = respondSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const connection = await prisma.connection.findUnique({ where: { id: req.params.id } });
  if (!connection) {
    return res.status(404).json({ error: 'connection_not_found' });
  }
  if (connection.status !== 'pending') {
    return res.status(400).json({ error: 'not_pending' });
  }

  if (parsed.data.status === 'accepted') {
    if (req.user!.id !== connection.addresseeId) {
      return res.status(403).json({ error: 'not_addressee' });
    }
    const updated = await prisma.connection.update({
      where: { id: connection.id },
      data: { status: 'accepted', respondedAt: new Date() },
    });
    return res.json({ connection: updated });
  }

  // rejected: hem istek alan (reddediyor) hem de gönderen (vazgeçiyor) yapabilir
  if (req.user!.id !== connection.addresseeId && req.user!.id !== connection.requesterId) {
    return res.status(403).json({ error: 'not_participant' });
  }
  await prisma.connection.delete({ where: { id: connection.id } });
  res.json({ ok: true });
});

connectionsRouter.get('/status/:userId', async (req, res) => {
  const state = await getConnectionState(req.user!.id, req.params.userId);
  res.json(state);
});

connectionsRouter.get('/', async (req, res) => {
  if (req.query.status === 'pending') {
    const requests = await prisma.connection.findMany({
      where: { addresseeId: req.user!.id, status: 'pending' },
      include: { requester: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ requests });
  }

  const connections = await prisma.connection.findMany({
    where: {
      status: 'accepted',
      OR: [{ requesterId: req.user!.id }, { addresseeId: req.user!.id }],
    },
    include: { requester: true, addressee: true },
    orderBy: { respondedAt: 'desc' },
  });

  const result = connections.map((c) => ({
    connectionId: c.id,
    user: c.requesterId === req.user!.id ? c.addressee : c.requester,
  }));
  res.json({ connections: result });
});
