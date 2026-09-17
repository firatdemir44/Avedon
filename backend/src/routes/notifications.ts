import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { toNotificationRow } from '../notifications';
import { MAX_RULES_PER_USER, describeAnyWatchQuery, parseRuleQuery, safeParseWatchInput } from '../watch';
import { makeHandle } from './handle';

// Faz 2, Adım 1: bildirimler ve izleme kuralları.
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);
const handle = makeHandle('notifications');

notificationsRouter.get(
  '/',
  handle(async (req, res) => {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 30));
    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: limit }),
      prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
    ]);
    res.json({ notifications: rows.map(toNotificationRow), unreadCount });
  })
);

notificationsRouter.get(
  '/unread-count',
  handle(async (req, res) => {
    res.json({ unreadCount: await prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }) });
  })
);

const readSchema = z.object({ ids: z.array(z.string().min(1)).max(100).optional(), all: z.boolean().optional() }).strict();

notificationsRouter.post(
  '/read',
  handle(async (req, res) => {
    const parsed = readSchema.safeParse(req.body ?? {});
    if (!parsed.success || (!parsed.data.all && !parsed.data.ids?.length)) {
      return res.status(400).json({ error: 'invalid_body' });
    }
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, readAt: null, ...(parsed.data.all ? {} : { id: { in: parsed.data.ids } }) },
      data: { readAt: new Date() },
    });
    res.json({ unreadCount: await prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }) });
  })
);

// --- İzleme kuralları ---------------------------------------------------------

export const watchRulesRouter = Router();
watchRulesRouter.use(requireAuth);

function toRuleRow(row: { id: string; name: string; queryJson: string; active: boolean; lastMatchedAt: Date | null; createdAt: Date; _count?: { matches: number } }) {
  return {
    id: row.id,
    name: row.name,
    query: parseRuleQuery(row.queryJson) ?? {},
    active: row.active,
    lastMatchedAt: row.lastMatchedAt,
    matchCount: row._count?.matches ?? 0,
    createdAt: row.createdAt,
  };
}

const RULE_INCLUDE = { _count: { select: { matches: true } } } as const;

watchRulesRouter.get(
  '/',
  handle(async (req, res) => {
    const rows = await prisma.watchRule.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, include: RULE_INCLUDE });
    res.json({ rules: rows.map(toRuleRow), max: MAX_RULES_PER_USER });
  })
);

const createSchema = z.object({ name: z.string().trim().max(80).optional(), query: z.unknown() }).strict();

watchRulesRouter.post(
  '/',
  handle(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    const query = parsed.success ? safeParseWatchInput(parsed.data.query) : null;
    if (!parsed.success || !query?.success) {
      return res.status(400).json({ error: 'invalid_body', details: query && !query.success ? query.error.flatten() : undefined });
    }
    const count = await prisma.watchRule.count({ where: { userId: req.user!.id } });
    if (count >= MAX_RULES_PER_USER) return res.status(409).json({ error: 'too_many_rules', max: MAX_RULES_PER_USER });
    const row = await prisma.watchRule.create({
      data: { userId: req.user!.id, name: parsed.data.name || describeAnyWatchQuery(query.data), queryJson: JSON.stringify(query.data) },
      include: RULE_INCLUDE,
    });
    res.status(201).json({ rule: toRuleRow(row) });
  })
);

const patchSchema = z.object({ name: z.string().trim().min(1).max(80).optional(), active: z.boolean().optional() }).strict();

watchRulesRouter.patch(
  '/:id',
  handle(async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
    const own = await prisma.watchRule.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!own) return res.status(404).json({ error: 'rule_not_found' });
    const row = await prisma.watchRule.update({ where: { id: own.id }, data: parsed.data, include: RULE_INCLUDE });
    res.json({ rule: toRuleRow(row) });
  })
);

watchRulesRouter.delete(
  '/:id',
  handle(async (req, res) => {
    const own = await prisma.watchRule.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!own) return res.status(404).json({ error: 'rule_not_found' });
    await prisma.watchRule.delete({ where: { id: own.id } });
    res.status(204).end();
  })
);
