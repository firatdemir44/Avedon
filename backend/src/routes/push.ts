import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { makeHandle } from './handle';
import { isPushConfigured, mockOutbox, pushPublicKey, sendPush } from '../push';

// Anlık bildirim abonelikleri: /api/push
export const pushRouter = Router();
const handle = makeHandle('push');
const MAX_SUBSCRIPTIONS_PER_USER = 10;

// Oturumsuz: istemci abone olmadan önce özelliğin açık olup olmadığını ve açık anahtarı öğrenir.
pushRouter.get(
  '/public-key',
  handle(async (_req, res) => {
    res.json({ enabled: isPushConfigured(), publicKey: pushPublicKey() });
  })
);

pushRouter.use(requireAuth);

const subscribeSchema = z
  .object({
    endpoint: z.string().url().max(1000).refine((u) => u.startsWith('https://'), { message: 'https_only' }),
    keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(10).max(100) }).strict(),
    userAgent: z.string().max(300).optional(),
  })
  .strict();

pushRouter.post(
  '/subscribe',
  handle(async (req, res) => {
    const parsed = subscribeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const { endpoint, keys, userAgent } = parsed.data;
    // Aynı cihazda başka hesapla giriş yapıldıysa abonelik yeni kullanıcıya geçer.
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: req.user!.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent ?? '' },
      update: { userId: req.user!.id, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent ?? '' },
    });
    const all = await prisma.pushSubscription.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, select: { id: true } });
    if (all.length > MAX_SUBSCRIPTIONS_PER_USER) {
      await prisma.pushSubscription.deleteMany({ where: { id: { in: all.slice(MAX_SUBSCRIPTIONS_PER_USER).map((s) => s.id) } } });
    }
    res.status(201).json({ ok: true });
  })
);

const unsubscribeSchema = z.object({ endpoint: z.string().min(1).max(1000) }).strict();

// Çıkış yaparken ya da bildirimi kapatırken: yalnızca kendi aboneliği silinir.
pushRouter.post(
  '/unsubscribe',
  handle(async (req, res) => {
    const parsed = unsubscribeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
    await prisma.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint, userId: req.user!.id } });
    res.status(204).end();
  })
);

pushRouter.get(
  '/status',
  handle(async (req, res) => {
    const count = await prisma.pushSubscription.count({ where: { userId: req.user!.id } });
    res.json({ enabled: isPushConfigured(), devices: count });
  })
);

// "Deneme bildirimi gönder": kullanıcı kurulumun çalıştığını kendi görür.
pushRouter.post(
  '/test',
  handle(async (req, res) => {
    if (!isPushConfigured()) return res.status(503).json({ error: 'push_not_configured' });
    const count = await prisma.pushSubscription.count({ where: { userId: req.user!.id } });
    if (!count && process.env.PUSH_MOCK !== '1') return res.status(409).json({ error: 'no_subscription' });
    await sendPush([req.user!.id], { title: 'Takyon', body: 'Bildirimler açık. Yeni mesaj ve tekliflerde haber vereceğiz.', kind: 'test', tag: 'test' });
    res.json({ ok: true, devices: count });
  })
);

// Yalnızca sahte kipte: testler gönderilenleri okur.
pushRouter.get(
  '/mock-outbox',
  handle(async (req, res) => {
    if (process.env.PUSH_MOCK !== '1') return res.status(404).json({ error: 'not_found' });
    res.json({ items: mockOutbox.filter((m) => m.userId === req.user!.id) });
  })
);
