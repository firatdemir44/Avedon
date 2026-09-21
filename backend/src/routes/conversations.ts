import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { checkClaimable, messageVideos } from '../videoLinks';
import { makeHandle } from './handle';
import { requireAuth } from '../middleware/auth';
import { getConnectionState, isConnectedAccepted } from '../connections';
import {
  PARTICIPANT_SELECT,
  findOrCreateConversation,
  isParticipant,
  otherParticipantId,
} from '../conversations';

export const conversationsRouter = Router();
conversationsRouter.use(requireAuth);

const handle = makeHandle('conversations');

const LAST_MESSAGE_SELECT = { id: true, body: true, createdAt: true, senderId: true } as const;

const conversationInclude = {
  userA: { select: PARTICIPANT_SELECT },
  userB: { select: PARTICIPANT_SELECT },
  messages: { orderBy: { createdAt: 'desc' }, take: 1, select: LAST_MESSAGE_SELECT },
} as const;

type ConversationWithIncludes = {
  id: string;
  userAId: string;
  userBId: string;
  lastMessageAt: Date;
  userA: unknown;
  userB: unknown;
  messages: { id: string; body: string; createdAt: Date; senderId: string }[];
};

function toSummary(conversation: ConversationWithIncludes, meId: string, unreadCount: number) {
  return {
    id: conversation.id,
    user: conversation.userAId === meId ? conversation.userB : conversation.userA,
    // Yazısız mesaj yalnızca video mesajıdır.
    lastMessage: conversation.messages[0] ? { ...conversation.messages[0], body: conversation.messages[0].body || 'Video' } : null,
    unreadCount,
    lastMessageAt: conversation.lastMessageAt,
  };
}

const startSchema = z.object({ userId: z.string().min(1) }).strict();

conversationsRouter.post(
  '/',
  handle(async (req, res) => {
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const { userId } = parsed.data;

    if (userId === req.user!.id) {
      return res.status(400).json({ error: 'cannot_message_self' });
    }

    const other = await prisma.user.findUnique({ where: { id: userId } });
    if (!other) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    const state = await getConnectionState(req.user!.id, userId);
    if (!isConnectedAccepted(state)) {
      return res.status(403).json({ error: 'not_connected' });
    }

    const created = await findOrCreateConversation(req.user!.id, userId);
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: created.id },
      include: conversationInclude,
    });
    const unreadCount = await prisma.message.count({
      where: { conversationId: conversation.id, senderId: { not: req.user!.id }, readAt: null },
    });

    res.json({ conversation: toSummary(conversation, req.user!.id, unreadCount) });
  })
);

conversationsRouter.get(
  '/',
  handle(async (req, res) => {
    const me = req.user!.id;

    const conversations = await prisma.conversation.findMany({
      where: { OR: [{ userAId: me }, { userBId: me }] },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      include: conversationInclude,
    });

    const unreadRows = conversations.length
      ? await prisma.message.groupBy({
          by: ['conversationId'],
          where: {
            conversationId: { in: conversations.map((c) => c.id) },
            senderId: { not: me },
            readAt: null,
          },
          _count: { _all: true },
        })
      : [];
    const unreadMap = new Map(unreadRows.map((row) => [row.conversationId, row._count._all]));

    res.json({
      conversations: conversations.map((c) => toSummary(c, me, unreadMap.get(c.id) ?? 0)),
    });
  })
);

// Ana ekrandaki "Mesajlar" rozetinin tüm listeyi çekmeden okunmamış sayısını
// öğrenebilmesi için. /:id route'larından önce tanımlı olmalı.
conversationsRouter.get(
  '/unread-count',
  handle(async (req, res) => {
    const me = req.user!.id;
    const count = await prisma.message.count({
      where: {
        senderId: { not: me },
        readAt: null,
        conversation: { OR: [{ userAId: me }, { userBId: me }] },
      },
    });
    res.json({ count });
  })
);

async function loadParticipantConversation(req: Request, res: Response) {
  const conversation = await prisma.conversation.findUnique({ where: { id: req.params.id } });
  if (!conversation) {
    res.status(404).json({ error: 'conversation_not_found' });
    return null;
  }
  if (!isParticipant(conversation, req.user!.id)) {
    res.status(403).json({ error: 'not_participant' });
    return null;
  }
  return conversation;
}

const messagesQuerySchema = z.object({
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

conversationsRouter.get(
  '/:id/messages',
  handle(async (req, res) => {
    const parsedQuery = messagesQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({ error: 'invalid_query', details: parsedQuery.error.flatten() });
    }

    const conversation = await loadParticipantConversation(req, res);
    if (!conversation) return;

    const { since, limit } = parsedQuery.data;

    // since verildiğinde gte kullanıyoruz: aynı milisaniyede oluşan iki mesajdan
    // biri gt ile sonsuza dek atlanabilirdi. Mükerrer kayıtları istemci id'ye
    // göre eliyor.
    const messages = since
      ? await prisma.message.findMany({
          where: { conversationId: conversation.id, createdAt: { gte: new Date(since) } },
          orderBy: { createdAt: 'asc' },
        })
      : (
          await prisma.message.findMany({
            where: { conversationId: conversation.id },
            orderBy: { createdAt: 'desc' },
            take: limit ?? 100,
          })
        ).reverse();

    const videos = await messageVideos(messages.map((m) => m.id));
    res.json({
      messages: messages.map((m) => ({
        id: m.id,
        body: m.body,
        senderId: m.senderId,
        quoteRequestId: m.quoteRequestId,
        video: videos.get(m.id) ?? null,
        createdAt: m.createdAt,
        readAt: m.readAt,
      })),
    });
  })
);

// Video mesajında yazı zorunlu değil.
const sendSchema = z
  .object({ body: z.string().trim().max(2000).optional(), videoId: z.string().min(1).optional() })
  .strict()
  .refine((d) => !!d.body || !!d.videoId, { message: 'empty_message' });

conversationsRouter.post(
  '/:id/messages',
  handle(async (req, res) => {
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    }

    const conversation = await loadParticipantConversation(req, res);
    if (!conversation) return;

    // Bağlantı hâlâ geçerli mi — okumak serbest ama yazmak için bağlantı şart.
    const otherId = otherParticipantId(conversation, req.user!.id);
    const state = await getConnectionState(req.user!.id, otherId);
    if (!isConnectedAccepted(state)) {
      return res.status(403).json({ error: 'not_connected' });
    }

    const { videoId } = parsed.data;
    if (videoId) {
      const claim = await checkClaimable(req.user!.id, videoId);
      if (claim) return res.status(claim === 'video_not_found' ? 404 : 409).json({ error: claim });
    }

    const now = new Date();
    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: { conversationId: conversation.id, senderId: req.user!.id, body: parsed.data.body ?? '', createdAt: now },
      }),
      prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: now } }),
    ]);

    if (videoId) {
      await prisma.videoLink.create({ data: { videoId, messageId: message.id, conversationId: conversation.id } });
    }
    const video = videoId ? (await messageVideos([message.id])).get(message.id) ?? null : null;

    res.status(201).json({
      message: {
        video,
        id: message.id,
        body: message.body,
        senderId: message.senderId,
        quoteRequestId: message.quoteRequestId,
        createdAt: message.createdAt,
        readAt: message.readAt,
      },
    });
  })
);

conversationsRouter.patch(
  '/:id/read',
  handle(async (req, res) => {
    const conversation = await loadParticipantConversation(req, res);
    if (!conversation) return;

    const result = await prisma.message.updateMany({
      where: { conversationId: conversation.id, senderId: { not: req.user!.id }, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ ok: true, updated: result.count });
  })
);
