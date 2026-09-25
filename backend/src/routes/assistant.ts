import express, { Router } from 'express';
import { SpeechNotConfiguredError, isSpeechConfigured, transcribe } from '../speechToText';
import { MAX_REQUEST_BYTES, TtsLimitError, TtsNotConfiguredError, checkAndCount, isTtsConfigured, synthesize } from '../textToSpeech';
import { assistantReport } from '../assistantReport';
import { z } from 'zod';
import { prisma } from '../db';
import { LlmNotConfiguredError, isLlmConfigured } from '../llm';
import { requireAuth } from '../middleware/auth';
import { deleteMemory, readMemory, writeMemory } from '../assistant/memory';
import { MEMORY_KEYS, memoryKeyDef } from '../assistant/memoryKeys';
import { runAssistantTurn, toView } from '../assistant/run';
import { ASSISTANT_NAME, LEGACY_PERSONA_KEY, greetingText } from '../assistant/persona';
import { MAX_BUYER_QUESTIONS_PER_DAY } from '../assistant/buyer';
import { notify } from '../notifications';
import { t } from '../i18n';
import { makeHandle } from './handle';

// Faz 1, Adım 5: firma asistanı. Sohbet kaydı sunucuda (istemci threadId tutar),
// araç çağrıları yanıtta kart olarak döner, firma hafızası yalnızca kullanıcı
// onayıyla yazılır. Eski POST /api/advisor/ask bir sürüm daha kalır.
export const assistantRouter = Router();
assistantRouter.use(requireAuth);

// Asistan raporu: firmanın asistanına başka firmalardan gelen sorular (son 7 ya da 30 gün).
assistantRouter.get('/report', async (req, res) => {
  if (!req.user!.companyId) return res.status(400).json({ error: 'no_company' });
  const days = req.query.days === '30' ? 30 : 7;
  res.json({ report: await assistantReport(req.user!.companyId, days) });
});

// Sesli soru: telefonun kaydettiği ses (webm/mp4, en çok ~2 dk) yazıya çevrilir.
assistantRouter.get('/speech', (_req, res) => {
  res.json({ available: isSpeechConfigured(), voice: isTtsConfigured() });
});
assistantRouter.post('/transcribe', express.raw({ type: () => true, limit: '8mb' }), async (req, res) => {
  const audio = req.body as Buffer;
  if (!Buffer.isBuffer(audio) || audio.length < 1000) return res.status(400).json({ error: t(req.lang, 'Ses kaydı çok kısa') });
  try {
    res.json({ text: await transcribe(audio) });
  } catch (err) {
    if (err instanceof SpeechNotConfiguredError) return res.status(503).json({ error: t(req.lang, 'Sesli soru şu an kullanılamıyor') });
    console.error('[transcribe]', (err as Error).message);
    res.status(502).json({ error: t(req.lang, 'Ses yazıya çevrilemedi, lütfen tekrar deneyin') });
  }
});
// Doğal ses (textToSpeech.ts): telefon metni parça parça gönderir, MP3 döner. Hata/sınırda telefon kendi sesine döner.
assistantRouter.post('/speak', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const lang = req.body?.lang === 'en' ? 'en' : 'tr';
  if (!text) return res.status(400).json({ error: 'text_required' });
  if (Buffer.byteLength(text, 'utf8') > MAX_REQUEST_BYTES) return res.status(413).json({ error: 'text_too_long' });
  try {
    checkAndCount(req.user!.id, text.length);
    const audio = await synthesize(text, lang);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(audio);
  } catch (err) {
    if (err instanceof TtsNotConfiguredError) return res.status(503).json({ error: 'tts_unavailable' });
    if (err instanceof TtsLimitError) return res.status(429).json({ error: 'tts_limit' });
    console.error('[speak]', (err as Error).message);
    res.status(502).json({ error: 'tts_failed' });
  }
});
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
    res.json({ thread, messages: rows.map((r) => toView(r, req.lang)) });
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

    // Satıcı asistanına günlük soru sınırı (kötüye kullanım ve maliyet).
    if (thread.channel === 'buyer') {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const asked = await prisma.assistantMessage.count({ where: { role: 'user', createdAt: { gte: since }, thread: { userId: req.user!.id, channel: 'buyer' } } });
      if (asked >= MAX_BUYER_QUESTIONS_PER_DAY) return res.status(429).json({ error: 'daily_limit', max: MAX_BUYER_QUESTIONS_PER_DAY });
    }

    try {
      const result = await runAssistantTurn({
        threadId: thread.id,
        userId: req.user!.id,
        companyId: req.user!.companyId ?? null,
        text: parsed.data.text,
        lang: req.lang,
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
    const L = (x: { label: string; hint: string }) => ({ ...x, label: t(req.lang, x.label), hint: t(req.lang, x.hint) });
    res.json({ memory: (await readMemory(companyId)).map(L), keys: MEMORY_KEYS.map(L) });
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
    if (def.auto) return res.status(409).json({ error: 'auto_memory_key' });
    const parsed = memoryValueSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    if (def.kind === 'number' && typeof parsed.data.value !== 'number') {
      return res.status(400).json({ error: 'value_must_be_number' });
    }
    const entry = await writeMemory(companyId, def.key, parsed.data.value);
    res.json({ entry: { ...entry, label: t(req.lang, entry.label), hint: t(req.lang, entry.hint) } });
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

// Kişilik seçimi kaldırıldı (2026-09-23). Uçlar eski uygulama sürümleri çökmesin
// diye duruyor: her zaman "seçilmiş" tek kimlik döner, PUT hiçbir şey kaydetmez.
const legacyPersona = { key: LEGACY_PERSONA_KEY, name: ASSISTANT_NAME, tagline: 'Tekstil ve maliyet asistanınız.' };

assistantRouter.get(
  '/persona',
  handle(async (_req, res) => {
    res.json({ persona: LEGACY_PERSONA_KEY, effective: LEGACY_PERSONA_KEY, options: [legacyPersona] });
  })
);

assistantRouter.put(
  '/persona',
  handle(async (_req, res) => {
    res.json({ persona: LEGACY_PERSONA_KEY, name: ASSISTANT_NAME });
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
      prisma.user.findUnique({ where: { id: me.id }, select: { firstName: true } }),
      me.companyId
        ? prisma.sampleRequest.count({ where: { product: { companyId: me.companyId }, status: 'talep_edildi' } })
        : Promise.resolve(0),
      prisma.message.count({
        where: { readAt: null, senderId: { not: me.id }, conversation: { OR: [{ userAId: me.id }, { userBId: me.id }] } },
      }),
      me.companyId ? prisma.companyMemory.count({ where: { companyId: me.companyId } }) : Promise.resolve(0),
    ]);
    res.json({
      persona: LEGACY_PERSONA_KEY,
      name: t(req.lang, ASSISTANT_NAME),
      text: greetingText({ firstName: user?.firstName ?? null, hour, pendingIncoming, unreadMessages, memoryEmpty: memoryCount === 0, lang: req.lang }),
      pendingIncoming,
      unreadMessages,
      memoryEmpty: memoryCount === 0,
    });
  })
);

// --- Satıcı asistanı (Faz 2, Adım 3) -------------------------------------------
// Alıcı, başka bir firmanın asistanıyla konuşur. İplik "buyer" kanalındadır; mesaj
// gönderme ve okuma yukarıdaki /threads/:id uçlarıyla aynıdır (run.ts kipi iplikten anlar).

assistantRouter.post(
  '/seller/:companyId/thread',
  handle(async (req, res) => {
    const me = req.user!;
    const company = await prisma.company.findUnique({ where: { id: req.params.companyId }, select: { id: true, name: true } });
    if (!company) return res.status(404).json({ error: 'company_not_found' });
    if (me.companyId && me.companyId === company.id) return res.status(400).json({ error: 'own_company' });

    const existing = await prisma.assistantThread.findFirst({
      where: { userId: me.id, channel: 'buyer', targetCompanyId: company.id },
      orderBy: { updatedAt: 'desc' },
      select: THREAD_SELECT,
    });
    const thread =
      existing ??
      (await prisma.assistantThread.create({
        data: { userId: me.id, companyId: me.companyId ?? null, channel: 'buyer', targetCompanyId: company.id, title: company.name },
        select: THREAD_SELECT,
      }));
    res.status(existing ? 200 : 201).json({ thread, company });
  })
);

// SSS: firmanın kendi yönettiği soru-cevaplar (satıcı asistanı okur).
const faqSchema = z.object({ question: z.string().trim().min(3).max(300), answer: z.string().trim().min(1).max(1000) }).strict();
const MAX_FAQS = 60;

assistantRouter.get(
  '/faq',
  handle(async (req, res) => {
    const companyId = requireCompany(req);
    if (!companyId) return res.status(403).json({ error: 'no_company' });
    const faqs = await prisma.companyFaq.findMany({ where: { companyId }, orderBy: { updatedAt: 'desc' } });
    res.json({ faqs: faqs.map((f) => ({ id: f.id, question: f.question, answer: f.answer, updatedAt: f.updatedAt })) });
  })
);

assistantRouter.post(
  '/faq',
  handle(async (req, res) => {
    const companyId = requireCompany(req);
    if (!companyId) return res.status(403).json({ error: 'no_company' });
    const parsed = faqSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    if ((await prisma.companyFaq.count({ where: { companyId } })) >= MAX_FAQS) return res.status(409).json({ error: 'too_many_faqs', max: MAX_FAQS });
    const faq = await prisma.companyFaq.create({ data: { companyId, ...parsed.data } });
    res.status(201).json({ faq: { id: faq.id, question: faq.question, answer: faq.answer, updatedAt: faq.updatedAt } });
  })
);

assistantRouter.put(
  '/faq/:id',
  handle(async (req, res) => {
    const companyId = requireCompany(req);
    if (!companyId) return res.status(403).json({ error: 'no_company' });
    const parsed = faqSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const own = await prisma.companyFaq.findFirst({ where: { id: req.params.id, companyId } });
    if (!own) return res.status(404).json({ error: 'faq_not_found' });
    const faq = await prisma.companyFaq.update({ where: { id: own.id }, data: parsed.data });
    res.json({ faq: { id: faq.id, question: faq.question, answer: faq.answer, updatedAt: faq.updatedAt } });
  })
);

assistantRouter.delete(
  '/faq/:id',
  handle(async (req, res) => {
    const companyId = requireCompany(req);
    if (!companyId) return res.status(403).json({ error: 'no_company' });
    const own = await prisma.companyFaq.findFirst({ where: { id: req.params.id, companyId } });
    if (!own) return res.status(404).json({ error: 'faq_not_found' });
    await prisma.companyFaq.delete({ where: { id: own.id } });
    res.status(204).end();
  })
);

// Asistanın firmaya ilettiği sorular: satıcı listeler ve cevaplar.
assistantRouter.get(
  '/questions',
  handle(async (req, res) => {
    const companyId = requireCompany(req);
    if (!companyId) return res.status(403).json({ error: 'no_company' });
    const rows = await prisma.companyQuestion.findMany({
      where: { companyId },
      orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      include: { asker: { select: { id: true, firstName: true, lastName: true, company: { select: { id: true, name: true } } } } },
    });
    const productIds = rows.map((r) => r.productId).filter((id): id is string => !!id);
    const products = productIds.length ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, code: true } }) : [];
    const codeById = new Map(products.map((p) => [p.id, p.code]));
    res.json({
      questions: rows.map((r) => ({
        id: r.id,
        question: r.question,
        answer: r.answer,
        status: r.status,
        createdAt: r.createdAt,
        answeredAt: r.answeredAt,
        product: r.productId ? { id: r.productId, code: codeById.get(r.productId) ?? '' } : null,
        asker: { id: r.asker.id, name: `${r.asker.firstName} ${r.asker.lastName}`, company: r.asker.company },
      })),
      openCount: rows.filter((r) => r.status === 'open').length,
    });
  })
);

const answerSchema = z.object({ answer: z.string().trim().min(1).max(1000), addToFaq: z.boolean().optional() }).strict();

assistantRouter.post(
  '/questions/:id/answer',
  handle(async (req, res) => {
    const companyId = requireCompany(req);
    if (!companyId) return res.status(403).json({ error: 'no_company' });
    const parsed = answerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const q = await prisma.companyQuestion.findFirst({ where: { id: req.params.id, companyId }, include: { company: { select: { name: true } } } });
    if (!q) return res.status(404).json({ error: 'question_not_found' });

    await prisma.companyQuestion.update({ where: { id: q.id }, data: { answer: parsed.data.answer, status: 'answered', answeredAt: new Date() } });
    if (parsed.data.addToFaq) {
      await prisma.companyFaq.create({ data: { companyId, question: q.question, answer: parsed.data.answer } });
    }
    // Cevap alıcının ipliğine asistan mesajı olarak da düşer (sohbeti açınca görür).
    if (q.threadId) {
      const text = `${q.company.name} yetkilisi sorunuzu cevapladı.\nSoru: ${q.question}\nCevap: ${parsed.data.answer}`;
      await prisma.assistantMessage
        .create({
          data: {
            threadId: q.threadId,
            role: 'assistant',
            contentJson: JSON.stringify({ text, toolCalls: [], memorySuggestions: [], watchSuggestions: [] }),
            apiJson: JSON.stringify([{ role: 'user', content: `[Sistem notu: firma yetkilisi şu soruyu cevapladı. Soru: ${q.question} Cevap: ${parsed.data.answer}]` }, { role: 'assistant', content: text }]),
          },
        })
        .catch(() => {});
    }
    await notify(q.askerId, {
      kind: 'company_question_answered',
      title: '{company} sorunuzu cevapladı',
      vars: { company: q.company.name },
      body: parsed.data.answer.slice(0, 140),
      rawBody: true,
      data: { questionId: q.id, threadId: q.threadId ?? undefined, companyId },
    });
    res.json({ ok: true });
  })
);
