import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { LlmNotConfiguredError, isLlmConfigured } from '../llm';
import { requireAuth } from '../middleware/auth';
import { deleteMemory, readMemory, writeMemory } from '../assistant/memory';
import { MEMORY_KEYS, memoryKeyDef } from '../assistant/memoryKeys';
import { runAssistantTurn, toView } from '../assistant/run';
import { PERSONAS, PERSONA_KEYS, greetingText, isPersonaKey, personaFor } from '../assistant/persona';
import { makeHandle } from './handle';

// Faz 1, Adım 5: firma asistanı. Sohbet kaydı sunucuda (istemci threadId tutar),
// araç çağrıları yanıtta kart olarak döner, firma hafızası yalnızca kullanıcı
// onayıyla yazılır. Eski POST /api/advisor/ask bir sürüm daha kalır.
export const assistantRouter = Router();
assistantRouter.use(requireAuth);
const handle = makeHandle('assistant');

const THREAD_SELECT = { id: true, title: true, channel: true, createdAt: true, updatedAt: true } as const;
const MAX_THREADS = 50;

async function ownThread(threadId: string, userId: string) {
  return prisma.assistantThread.findFirst({ where: { id: threadId, userId }, select: THREAD_SELECT });
}

assistantRouter.get(
  '/threads',
  handle(async (req, res) => {
    const threads = await prisma.assistantThread.findMany({
      where: { userId: req.user!.id, channel: 'app' },
      orderBy: { updatedAt: 'desc' },
      take: MAX_THREADS,
      select: THREAD_SELECT,
    });
    res.json({ threads });
  })
);

assistantRouter.post(
  '/threads',
  handle(async (req, res) => {
    const thread = await prisma.assistantThread.create({
      data: { userId: req.user!.id, companyId: req.user!.companyId ?? null, channel: 'app' },
      select: THREAD_SELECT,
    });
    res.status(201).json({ thread });
  })
);

assistantRouter.get(
  '/threads/:id',
  handle(async (req, res) => {
    const thread = await ownThread(req.params.id, req.user!.id);
    if (!thread) return res.status(404).json({ error: 'thread_not_found' });
    const rows = await prisma.assistantMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, contentJson: true, createdAt: true },
    });
    res.json({ thread, messages: rows.map(toView) });
  })
);

assistantRouter.delete(
  '/threads/:id',
  handle(async (req, res) => {
    const thread = await ownThread(req.params.id, req.user!.id);
    if (!thread) return res.status(404).json({ error: 'thread_not_found' });
    await prisma.assistantThread.delete({ where: { id: thread.id } });
    res.status(204).end();
  })
);

const messageSchema = z.object({ text: z.string().trim().min(1).max(4000) });

assistantRouter.post(
  '/threads/:id/messages',
  handle(async (req, res) => {
    if (!isLlmConfigured()) return res.status(503).json({ error: 'assistant_not_configured' });
    const thread = await ownThread(req.params.id, req.user!.id);
    if (!thread) return res.status(404).json({ error: 'thread_not_found' });
    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

    try {
      const result = await runAssistantTurn({
        threadId: thread.id,
        userId: req.user!.id,
        companyId: req.user!.companyId ?? null,
        text: parsed.data.text,
      });
      const updated = await ownThread(thread.id, req.user!.id);
      res.json({ ...result, thread: updated });
    } catch (err) {
      if (err instanceof LlmNotConfiguredError) return res.status(503).json({ error: 'assistant_not_configured' });
      console.error('Assistant turn error:', err);
      res.status(502).json({ error: 'assistant_failed' });
    }
  })
);

// --- Firma hafızası ---------------------------------------------------------

function requireCompany(req: { user?: { companyId: string | null } | null }) {
  return req.user?.companyId ?? null;
}

assistantRouter.get(
  '/memory',
  handle(async (req, res) => {
    const companyId = requireCompany(req);
    if (!companyId) return res.status(403).json({ error: 'no_company' });
    res.json({ memory: await readMemory(companyId), keys: MEMORY_KEYS });
  })
);

const memoryValueSchema = z.object({ value: z.union([z.number(), z.string().trim().min(1).max(500)]) });

assistantRouter.put(
  '/memory/:key',
  handle(async (req, res) => {
    const companyId = requireCompany(req);
    if (!companyId) return res.status(403).json({ error: 'no_company' });
    const def = memoryKeyDef(req.params.key);
    if (!def) return res.status(404).json({ error: 'unknown_memory_key' });
    const parsed = memoryValueSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    if (def.kind === 'number' && typeof parsed.data.value !== 'number') {
      return res.status(400).json({ error: 'value_must_be_number' });
    }
    res.json({ entry: await writeMemory(companyId, def.key, parsed.data.value) });
  })
);

assistantRouter.delete(
  '/memory/:key',
  handle(async (req, res) => {
    const companyId = requireCompany(req);
    if (!companyId) return res.status(403).json({ error: 'no_company' });
    if (!memoryKeyDef(req.params.key)) return res.status(404).json({ error: 'unknown_memory_key' });
    await deleteMemory(companyId, req.params.key);
    res.status(204).end();
  })
);

// --- Kişilik ve karşılama (Adım 9) -------------------------------------------

const personaOptions = () => PERSONA_KEYS.map((k) => ({ key: k, name: PERSONAS[k].name, tagline: PERSONAS[k].tagline }));

assistantRouter.get(
  '/persona',
  handle(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { assistantPersona: true } });
    const chosen = isPersonaKey(user?.assistantPersona) ? user!.assistantPersona : null;
    res.json({ persona: chosen, effective: personaFor(chosen).key, options: personaOptions() });
  })
);

assistantRouter.put(
  '/persona',
  handle(async (req, res) => {
    const key = (req.body as { persona?: unknown })?.persona;
    if (!isPersonaKey(key)) return res.status(400).json({ error: 'unknown_persona', options: PERSONA_KEYS });
    await prisma.user.update({ where: { id: req.user!.id }, data: { assistantPersona: key } });
    res.json({ persona: key, name: PERSONAS[key].name });
  })
);

// Modelsiz karşılama: saat (istemci gönderir, sunucu saati UTC), ad, bekleyen işler.
assistantRouter.get(
  '/greeting',
  handle(async (req, res) => {
    const me = req.user!;
    const hourRaw = Number(req.query.hour);
    const hour = Number.isInteger(hourRaw) && hourRaw >= 0 && hourRaw <= 23 ? hourRaw : new Date().getHours();
    const [user, pendingIncoming, unreadMessages, memoryCount] = await Promise.all([
      prisma.user.findUnique({ where: { id: me.id }, select: { firstName: true, assistantPersona: true } }),
      me.companyId
        ? prisma.sampleRequest.count({ where: { product: { companyId: me.companyId }, status: 'talep_edildi' } })
        : Promise.resolve(0),
      prisma.message.count({
        where: { readAt: null, senderId: { not: me.id }, conversation: { OR: [{ userAId: me.id }, { userBId: me.id }] } },
      }),
      me.companyId ? prisma.companyMemory.count({ where: { companyId: me.companyId } }) : Promise.resolve(0),
    ]);
    const chosen = isPersonaKey(user?.assistantPersona) ? user!.assistantPersona : null;
    const persona = personaFor(chosen);
    res.json({
      persona: chosen,
      name: persona.name,
      text: greetingText(persona, { firstName: user?.firstName ?? null, hour, pendingIncoming, unreadMessages, memoryEmpty: memoryCount === 0 }),
      pendingIncoming,
      unreadMessages,
      memoryEmpty: memoryCount === 0,
    });
  })
);
