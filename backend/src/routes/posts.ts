import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { makeHandle } from './handle';
import { requireAuth } from '../middleware/auth';
import { getAcceptedConnectionIds } from '../connections';
import {
  COMMENT_INCLUDE,
  POST_INCLUDE,
  canViewPost,
  cursorWhere,
  feedVisibilityWhere,
  toCommentRow,
  toFeedRow,
} from '../posts';

export const postsRouter = Router();
postsRouter.use(requireAuth);

const handle = makeHandle('posts');

const DEFAULT_LIMIT = 10;

async function loadViewablePost(req: Request, res: Response) {
  const post = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!post) {
    res.status(404).json({ error: 'post_not_found' });
    return null;
  }
  if (!(await canViewPost(req.user!.id, post))) {
    res.status(403).json({ error: 'not_allowed' });
    return null;
  }
  return post;
}

const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).optional(),
  before: z.string().datetime().optional(),
  beforeId: z.string().min(1).optional(),
  authorId: z.string().min(1).optional(),
});

postsRouter.get(
  '/',
  handle(async (req, res) => {
    const parsed = feedQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_query', details: parsed.error.flatten() });
    }
    const { limit = DEFAULT_LIMIT, before, beforeId, authorId } = parsed.data;
    const me = req.user!.id;

    const connectedIds = await getAcceptedConnectionIds(me);

    const posts = await prisma.post.findMany({
      where: {
        OR: feedVisibilityWhere(me, connectedIds),
        AND: cursorWhere(before, beforeId),
        ...(authorId ? { authorId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: POST_INCLUDE,
    });

    const likedSet = new Set<string>();
    if (posts.length > 0) {
      const liked = await prisma.postLike.findMany({
        where: { userId: me, postId: { in: posts.map((p) => p.id) } },
        select: { postId: true },
      });
      liked.forEach((row) => likedSet.add(row.postId));
    }

    const last = posts[posts.length - 1];
    res.json({
      posts: posts.map((p) => toFeedRow(p, likedSet.has(p.id))),
      nextCursor:
        posts.length === limit && last
          ? { before: last.createdAt.toISOString(), beforeId: last.id }
          : null,
    });
  })
);

// Fotoğraflar liste yanıtında dönmüyor (bkz. schema.prisma'daki açıklama);
// istemci görünür kartlar için tek tek buradan çekiyor.
postsRouter.get(
  '/:id/image',
  handle(async (req, res) => {
    const post = await loadViewablePost(req, res);
    if (!post) return;
    if (!post.imageUrl) {
      return res.status(404).json({ error: 'image_not_found' });
    }
    res.json({ imageUrl: post.imageUrl });
  })
);

const createSchema = z
  .object({
    body: z.string().trim().max(3000).optional(),
    // z.string().url() burada yetersiz: http://saldirgan.example/px.gif gibi bir
    // adresi de kabul ederdi ve herkese açık akışta her görüntülenme saldırganın
    // sunucusuna IP sızdıran bir piksel olurdu.
    imageUrl: z.string().startsWith('data:image/').max(2_000_000).optional(),
    productId: z.string().min(1).optional(),
    visibility: z.enum(['public', 'connections']).optional(),
  })
  .strict()
  .refine((data) => !!data.body?.trim() || !!data.imageUrl, { message: 'empty_post' });

postsRouter.post(
  '/',
  handle(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const { body, imageUrl, productId, visibility } = parsed.data;

    if (productId) {
      if (!req.user!.companyId) {
        return res.status(403).json({ error: 'no_company' });
      }
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, companyId: true },
      });
      if (!product) {
        return res.status(404).json({ error: 'product_not_found' });
      }
      // Başkasının ürününü kendi gönderisine iliştirip talep toplamasın diye.
      if (product.companyId !== req.user!.companyId) {
        return res.status(403).json({ error: 'not_your_company' });
      }
    }

    const post = await prisma.post.create({
      data: {
        authorId: req.user!.id,
        body: body?.trim() ?? '',
        imageUrl,
        productId,
        visibility: visibility ?? 'public',
      },
      include: POST_INCLUDE,
    });

    res.status(201).json({ post: toFeedRow(post, false, true) });
  })
);

postsRouter.delete(
  '/:id',
  handle(async (req, res) => {
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) {
      return res.status(404).json({ error: 'post_not_found' });
    }
    if (post.authorId !== req.user!.id) {
      return res.status(403).json({ error: 'not_author' });
    }
    await prisma.post.delete({ where: { id: post.id } });
    res.status(204).send();
  })
);

postsRouter.post(
  '/:id/like',
  handle(async (req, res) => {
    const post = await loadViewablePost(req, res);
    if (!post) return;

    await prisma.postLike.upsert({
      where: { postId_userId: { postId: post.id, userId: req.user!.id } },
      create: { postId: post.id, userId: req.user!.id },
      update: {},
    });
    const likeCount = await prisma.postLike.count({ where: { postId: post.id } });
    res.json({ liked: true, likeCount });
  })
);

postsRouter.delete(
  '/:id/like',
  handle(async (req, res) => {
    const post = await loadViewablePost(req, res);
    if (!post) return;

    await prisma.postLike.deleteMany({ where: { postId: post.id, userId: req.user!.id } });
    const likeCount = await prisma.postLike.count({ where: { postId: post.id } });
    res.json({ liked: false, likeCount });
  })
);

postsRouter.get(
  '/:id/comments',
  handle(async (req, res) => {
    const post = await loadViewablePost(req, res);
    if (!post) return;

    const comments = await prisma.postComment.findMany({
      where: { postId: post.id },
      orderBy: { createdAt: 'asc' },
      include: COMMENT_INCLUDE,
    });
    res.json({ comments: comments.map(toCommentRow) });
  })
);

const commentSchema = z.object({ body: z.string().trim().min(1).max(1000) }).strict();

postsRouter.post(
  '/:id/comments',
  handle(async (req, res) => {
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    }

    const post = await loadViewablePost(req, res);
    if (!post) return;

    const comment = await prisma.postComment.create({
      data: { postId: post.id, authorId: req.user!.id, body: parsed.data.body },
      include: COMMENT_INCLUDE,
    });
    res.status(201).json({ comment: toCommentRow(comment) });
  })
);

// Yorumu, yorumun sahibi ya da gönderinin sahibi silebilir — gönderisi taciz
// içeren yorum alan kişinin tek müdahale imkânı bu.
postsRouter.delete(
  '/:postId/comments/:commentId',
  handle(async (req, res) => {
    const comment = await prisma.postComment.findUnique({
      where: { id: req.params.commentId },
      include: { post: { select: { id: true, authorId: true } } },
    });
    if (!comment || comment.postId !== req.params.postId) {
      return res.status(404).json({ error: 'comment_not_found' });
    }
    if (comment.authorId !== req.user!.id && comment.post.authorId !== req.user!.id) {
      return res.status(403).json({ error: 'not_allowed' });
    }

    await prisma.postComment.delete({ where: { id: comment.id } });
    res.status(204).send();
  })
);
