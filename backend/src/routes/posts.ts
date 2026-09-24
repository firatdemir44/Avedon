import { Router, type Request, type Response } from 'express';
import { Prisma } from '@prisma/client';
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
  tenderCardsFor,
} from '../posts';
import { deleteVideoCompletely, refreshPendingVideos } from '../videos';
import { fetchPreview, isPreviewError, parseHttpUrl } from '../linkPreview';
import { NOT_TEXTILE_MESSAGE, REPORT_REASONS, checkTextileRelevance, feedFilters, publicPostRule, reportPost } from '../feedRules';

export const postsRouter = Router();
postsRouter.use(requireAuth);

const handle = makeHandle('posts');

const DEFAULT_LIMIT = 10;

// Paylaşılan bağlantı (önizleme kartı). Görsel yalnızca data URL (izleme pikseli olmasın).
const linkSchema = z
  .object({
    url: z.string().trim().min(1).max(2000).refine((u) => !!parseHttpUrl(u), { message: 'invalid_url' }),
    title: z.string().trim().max(300).default(''),
    description: z.string().trim().max(240).default(''),
    siteName: z.string().trim().max(100).default(''),
    imageDataUrl: z.string().startsWith('data:image/').max(1_600_000).nullable().optional(),
  })
  .strict();
type LinkInput = z.infer<typeof linkSchema>;

function linkData(link: LinkInput | null) {
  if (!link) return { linkUrl: null, linkTitle: '', linkDescription: '', linkSiteName: '', linkImage: null };
  const url = parseHttpUrl(link.url)!;
  return {
    linkUrl: url.toString(),
    linkTitle: link.title,
    linkDescription: link.description,
    linkSiteName: link.siteName || url.hostname.replace(/^www\./i, ''),
    linkImage: link.imageDataUrl ?? null,
  };
}

// Önizleme isteği sınırı: kullanıcı başına saatte 30 (bellekte).
const PREVIEW_LIMIT = 30;
const previewHits = new Map<string, number[]>();
function previewAllowed(userId: string) {
  const now = Date.now();
  const hits = (previewHits.get(userId) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  const ok = hits.length < PREVIEW_LIMIT;
  if (ok) hits.push(now);
  previewHits.set(userId, hits);
  return ok;
}

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
  // Firma sayfasındaki "Firma Akışı" sekmesi: o firmanın çalışanlarının
  // gönderileri (görünürlük kuralları aynen geçerli).
  companyId: z.string().min(1).optional(),
  // Adım 6: "Bağlantılarım" sekmesi: bağlantılı kullanıcıların ve onların
  // firmalarındaki herkesin gönderileri. withProduct: yalnızca ürünlü gönderiler.
  scope: z.enum(['all', 'connections']).optional(),
  withProduct: z.enum(['1', 'true']).optional(),
  // Sektör sekmesinde "Benim için": firma türüne göre ilgili tedarik zinciri (feedRules.ts).
  forMe: z.enum(['1', 'true']).optional(),
});

postsRouter.get(
  '/',
  handle(async (req, res) => {
    const parsed = feedQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_query', details: parsed.error.flatten() });
    }
    const { limit = DEFAULT_LIMIT, before, beforeId, authorId, companyId, scope, withProduct, forMe } = parsed.data;
    const me = req.user!.id;

    const connectedIds = await getAcceptedConnectionIds(me);

    // Bağlantı kullanıcı düzeyinde; "bağlantıdaki firmalar" = bağlantılı
    // kullanıcıların firmaları (firma düzeyi bağlantı Faz 2 sorusu).
    let scopeWhere: Prisma.PostWhereInput = {};
    if (scope === 'connections') {
      const companies = connectedIds.length
        ? await prisma.user.findMany({ where: { id: { in: connectedIds }, companyId: { not: null } }, select: { companyId: true } })
        : [];
      const companyIds = [...new Set(companies.map((u) => u.companyId!))];
      scopeWhere = {
        OR: [{ authorId: { in: connectedIds } }, ...(companyIds.length ? [{ author: { companyId: { in: companyIds } } }] : [])],
      };
      // Bağlantı yoksa hiçbir gönderi gelmez (boş sekme, açıklama istemcide).
      if (!connectedIds.length) scopeWhere = { id: { in: [] } };
    }

    // Firma/kişi sayfasında gizleme ve "Benim için" uygulanmaz; şikâyetle gizlenen her yerde gizli.
    const onProfile = !!(authorId || companyId);
    const rules = onProfile
      ? [{ OR: [{ hiddenAt: null }, { authorId: me }] }]
      : await feedFilters({ id: me, companyId: req.user!.companyId ?? null }, connectedIds, { forMe: !!forMe && scope !== 'connections' });

    const posts = await prisma.post.findMany({
      where: {
        OR: feedVisibilityWhere(me, connectedIds),
        AND: [...cursorWhere(before, beforeId), scopeWhere, ...rules, ...(withProduct ? [{ productId: { not: null } }] : [])],
        ...(authorId ? { authorId } : {}),
        ...(companyId ? { author: { companyId } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: POST_INCLUDE,
    });

    // Cloudflare videoyu işlerken durum veritabanında "processing" kalır;
    // yerel geliştirmede webhook sunucumuza ulaşamadığı için akış isteğinde
    // bekleyen birkaç video Stream'den tazeleniyor.
    await refreshPendingVideos(posts);

    const likedSet = new Set<string>();
    if (posts.length > 0) {
      const liked = await prisma.postLike.findMany({
        where: { userId: me, postId: { in: posts.map((p) => p.id) } },
        select: { postId: true },
      });
      liked.forEach((row) => likedSet.add(row.postId));
    }

    // Ürünlü gönderilerde "Takibe Al" durumu (ProductFavorite ile aynı kayıt).
    const productIds = posts.map((p) => p.product?.id).filter((id): id is string => !!id);
    const favoriteSet = new Set<string>();
    if (productIds.length > 0) {
      const favorites = await prisma.productFavorite.findMany({
        where: { userId: me, productId: { in: productIds } },
        select: { productId: true },
      });
      favorites.forEach((row) => favoriteSet.add(row.productId));
    }

    const tenderCards = await tenderCardsFor(posts);
    const last = posts[posts.length - 1];
    res.json({
      posts: posts.map((p) => toFeedRow(p, likedSet.has(p.id), false, !!p.product && favoriteSet.has(p.product.id), p.tenderId ? tenderCards.get(p.tenderId) ?? null : null)),
      nextCursor:
        posts.length === limit && last
          ? { before: last.createdAt.toISOString(), beforeId: last.id }
          : null,
    });
  })
);

// Bağlantı önizlemesi: başlık, kısa açıklama, site adı ve (varsa) görsel.
postsRouter.post(
  '/link-preview',
  handle(async (req, res) => {
    const parsed = z.object({ url: z.string().trim().min(1).max(2000) }).safeParse(req.body);
    if (!parsed.success || !parseHttpUrl(parsed.data.url)) return res.status(400).json({ error: 'invalid_url' });
    if (!previewAllowed(req.user!.id)) return res.status(429).json({ error: 'rate_limited' });
    try {
      const p = await fetchPreview(parsed.data.url);
      res.json({
        preview: {
          url: p.url,
          title: p.title,
          description: p.description,
          siteName: p.siteName,
          hasImage: !!p.imageDataUrl,
          ...(p.imageDataUrl ? { imageDataUrl: p.imageDataUrl } : {}),
        },
      });
    } catch (err) {
      // Ağ hataları (DNS yok, bağlantı reddedildi) da önizleme hatasıdır; istemci alan adıyla kart gösterir.
      const reason = isPreviewError(err) ? err.message : (err as NodeJS.ErrnoException).code ?? 'network';
      return res.status(422).json({ error: 'preview_failed', reason });
    }
  })
);

// Herkese açık paylaşım hakkı: istemci seçeneği kilitli/açık gösterir, nedenini yazar.
postsRouter.get(
  '/public-rule',
  handle(async (req, res) => {
    const productId = typeof req.query.productId === 'string' ? req.query.productId : null;
    const excludePostId = typeof req.query.postId === 'string' ? req.query.postId : undefined;
    res.json({ rule: await publicPostRule(req.user!, { productId, excludePostId }) });
  })
);

// Akışta firma gizleme: gizlenen firmanın gönderileri akışta görünmez (firma sayfasında görünür).
postsRouter.get(
  '/mutes',
  handle(async (req, res) => {
    const mutes = await prisma.feedMute.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' } });
    const companies = mutes.length ? await prisma.company.findMany({ where: { id: { in: mutes.map((m) => m.companyId) } }, select: { id: true, name: true } }) : [];
    const names = new Map(companies.map((c) => [c.id, c.name]));
    res.json({ mutes: mutes.map((m) => ({ companyId: m.companyId, name: names.get(m.companyId) ?? 'Firma', createdAt: m.createdAt })) });
  })
);
postsRouter.post(
  '/mutes',
  handle(async (req, res) => {
    const parsed = z.object({ companyId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
    if (parsed.data.companyId === req.user!.companyId) return res.status(400).json({ error: 'own_company' });
    const company = await prisma.company.findUnique({ where: { id: parsed.data.companyId }, select: { id: true } });
    if (!company) return res.status(404).json({ error: 'company_not_found' });
    await prisma.feedMute.upsert({
      where: { userId_companyId: { userId: req.user!.id, companyId: company.id } },
      create: { userId: req.user!.id, companyId: company.id },
      update: {},
    });
    res.status(201).json({ ok: true });
  })
);
postsRouter.delete(
  '/mutes/:companyId',
  handle(async (req, res) => {
    await prisma.feedMute.deleteMany({ where: { userId: req.user!.id, companyId: req.params.companyId } });
    res.status(204).end();
  })
);

// Şikâyet: eşikler feedRules.ts'te (farklı firmalardan 3 şikâyet → gönderi gizlenir).
postsRouter.post(
  '/:id/report',
  handle(async (req, res) => {
    const parsed = z
      .object({ reason: z.enum(REPORT_REASONS.map((r) => r.key) as [string, ...string[]]), note: z.string().trim().max(500).optional() })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
    const viewable = await loadViewablePost(req, res);
    if (!viewable) return;
    const out = await reportPost(req.user!, viewable.id, parsed.data.reason as (typeof REPORT_REASONS)[number]['key'], parsed.data.note ?? '');
    if (out.status === 'own_post') return res.status(400).json({ error: 'own_post' });
    if (out.status === 'not_found') return res.status(404).json({ error: 'post_not_found' });
    res.status(201).json({ ok: true, already: out.status === 'already' });
  })
);

// Herkese açık paylaşım kuralları + içerik uygunluğu. Uygun değilse yanıtı yazar, false döner.
async function checkPublicAllowed(
  req: Request,
  res: Response,
  input: { body: string; imageUrl?: string | null; productId?: string | null; excludePostId?: string; link?: { title: string; description: string; siteName?: string } | null }
) {
  const rule = await publicPostRule(req.user!, { productId: input.productId, excludePostId: input.excludePostId });
  if (!rule.allowed) {
    res.status(403).json({ error: 'public_not_allowed', reason: rule.reason, message: rule.message, rule });
    return false;
  }
  const rel = await checkTextileRelevance({ body: input.body, imageDataUrl: input.imageUrl, productAttached: !!input.productId, link: input.link });
  if (!rel.textile) {
    res.status(422).json({ error: 'not_textile', message: NOT_TEXTILE_MESSAGE, detail: rel.reason });
    return false;
  }
  return true;
}

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

// Bağlantı kartının görseli: fotoğraf gibi akış yanıtında dönmez, tek tek çekilir.
postsRouter.get(
  '/:id/link-image',
  handle(async (req, res) => {
    const post = await loadViewablePost(req, res);
    if (!post) return;
    if (!post.linkImage) return res.status(404).json({ error: 'image_not_found' });
    res.json({ imageUrl: post.linkImage });
  })
);

// Gönderiye yalnızca kullanıcının kendi firmasının ürünü iliştirilebilir
// (başkasının ürününü kendi gönderisine iliştirip talep toplamasın diye).
// Uygun değilse yanıtı kendisi yazar ve false döner.
async function checkOwnProduct(req: Request, res: Response, productId: string) {
  if (!req.user!.companyId) {
    res.status(403).json({ error: 'no_company' });
    return false;
  }
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { companyId: true },
  });
  if (!product) {
    res.status(404).json({ error: 'product_not_found' });
    return false;
  }
  if (product.companyId !== req.user!.companyId) {
    res.status(403).json({ error: 'not_your_company' });
    return false;
  }
  return true;
}

async function isLikedBy(postId: string, userId: string) {
  const like = await prisma.postLike.findUnique({
    where: { postId_userId: { postId, userId } },
    select: { id: true },
  });
  return !!like;
}

// Tek gönderi: düzenleme ekranını doldurmak için. Görünürlük kuralı akıştakiyle aynı.
postsRouter.get(
  '/:id',
  handle(async (req, res) => {
    const viewable = await loadViewablePost(req, res);
    if (!viewable) return;
    const post = await prisma.post.findUnique({ where: { id: viewable.id }, include: POST_INCLUDE });
    if (!post) {
      return res.status(404).json({ error: 'post_not_found' });
    }
    res.json({ post: toFeedRow(post, await isLikedBy(post.id, req.user!.id)) });
  })
);

// Fotoğraf ve video bilinçli olarak düzenlenemez: değiştirmek için gönderi
// silinip yeniden paylaşılır. Beğeni ve yorumlar düzenlemede korunur.
const updateSchema = z
  .object({
    body: z.string().trim().max(3000).optional(),
    productId: z.string().min(1).nullable().optional(),
    visibility: z.enum(['public', 'connections']).optional(),
    // Bağlantı değiştirilebilir/kaldırılabilir (null). Fotoğraf/videolu gönderiye eklenemez.
    link: linkSchema.nullable().optional(),
  })
  .strict();

postsRouter.patch(
  '/:id',
  handle(async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    }

    const existing = await prisma.post.findUnique({
      where: { id: req.params.id },
      select: { id: true, authorId: true, body: true, imageUrl: true, videoId: true, productId: true, visibility: true, createdAt: true, linkUrl: true, linkTitle: true, linkDescription: true, linkSiteName: true, linkImage: true },
    });
    if (!existing) {
      return res.status(404).json({ error: 'post_not_found' });
    }
    if (existing.authorId !== req.user!.id) {
      return res.status(403).json({ error: 'not_author' });
    }

    const { body, productId, visibility, link } = parsed.data;
    const nextBody = body !== undefined ? body : existing.body;
    if (link && (existing.imageUrl || existing.videoId)) {
      return res.status(400).json({ error: 'link_and_media' });
    }
    const nextLink =
      link !== undefined
        ? link
          ? { title: link.title, description: link.description, siteName: link.siteName }
          : null
        : existing.linkUrl
          ? { title: existing.linkTitle, description: existing.linkDescription, siteName: existing.linkSiteName }
          : null;
    const linkChanged =
      link !== undefined &&
      (link
        ? parseHttpUrl(link.url)!.toString() !== existing.linkUrl || link.title !== existing.linkTitle || link.description !== existing.linkDescription
        : !!existing.linkUrl);
    if (!nextBody && !existing.imageUrl && !existing.videoId && !nextLink) {
      return res.status(400).json({ error: 'empty_post' });
    }
    if (productId && productId !== existing.productId && !(await checkOwnProduct(req, res, productId))) return;
    // Herkese açığa çevirmek yeni paylaşım sayılır; herkese açık gönderinin metni değişirse içerik yeniden denetlenir.
    const nextVisibility = visibility ?? existing.visibility;
    const nextProductId = productId !== undefined ? productId : existing.productId;
    if (nextVisibility === 'public' && existing.visibility !== 'public') {
      if (!(await checkPublicAllowed(req, res, { body: nextBody, imageUrl: existing.imageUrl, productId: nextProductId, excludePostId: existing.id, link: nextLink }))) return;
    } else if (nextVisibility === 'public' && (nextBody !== existing.body || linkChanged) && !nextProductId) {
      const rel = await checkTextileRelevance({ body: nextBody, imageDataUrl: existing.imageUrl, link: nextLink });
      if (!rel.textile) return res.status(422).json({ error: 'not_textile', message: NOT_TEXTILE_MESSAGE, detail: rel.reason });
    }

    const changed =
      nextBody !== existing.body ||
      (visibility !== undefined && visibility !== existing.visibility) ||
      (productId !== undefined && productId !== existing.productId) ||
      linkChanged;

    const post = await prisma.post.update({
      where: { id: existing.id },
      data: {
        body: nextBody,
        ...(visibility !== undefined ? { visibility } : {}),
        ...(productId !== undefined ? { productId } : {}),
        ...(link !== undefined ? linkData(link) : {}),
        // Hiçbir şey değişmediyse "düzenlendi" işareti konmaz.
        ...(changed ? { editedAt: new Date() } : {}),
      },
      include: POST_INCLUDE,
    });
    res.json({ post: toFeedRow(post, await isLikedBy(post.id, req.user!.id)) });
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
    videoId: z.string().min(1).optional(),
    visibility: z.enum(['public', 'connections']).optional(),
    link: linkSchema.optional(),
  })
  .strict()
  .refine((data) => !!data.body?.trim() || !!data.imageUrl || !!data.videoId || !!data.link, { message: 'empty_post' })
  .refine((data) => !(data.imageUrl && data.videoId), { message: 'image_and_video' })
  // Bir gönderide bağlantı ya da fotoğraf/video olur, ikisi birden olmaz.
  .refine((data) => !(data.link && (data.imageUrl || data.videoId)), { message: 'link_and_media' });

postsRouter.post(
  '/',
  handle(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const { body, imageUrl, productId, videoId, visibility, link } = parsed.data;

    if (videoId) {
      const video = await prisma.video.findUnique({
        where: { id: videoId },
        select: { ownerId: true, status: true, post: { select: { id: true } } },
      });
      // Başkasının yüklediği videoyu kendi gönderisine iliştiremesin. Yetkisizlikte
      // de 404: 403 videonun var olduğunu doğrulardı.
      if (!video || video.ownerId !== req.user!.id) {
        return res.status(404).json({ error: 'video_not_found' });
      }
      if (video.post) {
        return res.status(409).json({ error: 'video_already_used' });
      }
      if (video.status === 'error') {
        return res.status(400).json({ error: 'video_failed' });
      }
    }

    if (productId && !(await checkOwnProduct(req, res, productId))) return;
    if ((visibility ?? 'public') === 'public' && !(await checkPublicAllowed(req, res, { body: body?.trim() ?? '', imageUrl, productId, link }))) return;

    let post;
    try {
      post = await prisma.post.create({
        data: {
          authorId: req.user!.id,
          body: body?.trim() ?? '',
          imageUrl,
          productId,
          videoId,
          visibility: visibility ?? 'public',
          ...(link ? linkData(link) : {}),
        },
        include: POST_INCLUDE,
      });
    } catch (err) {
      // Aynı video iki istekle aynı anda iki gönderiye bağlanmaya çalışılırsa
      // yukarıdaki kontrolü ikisi de geçer; benzersizlik kısıtı ikincisini durdurur.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return res.status(409).json({ error: 'video_already_used' });
      }
      throw err;
    }

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
    // Gönderi gidince video da Cloudflare'den silinir; yoksa ücretli depoda
    // sahipsiz kalırdı. Silme hatası gönderi silmeyi geri almaz.
    if (post.videoId) {
      await deleteVideoCompletely(post.videoId).catch((err) =>
        console.error('[posts] video cleanup failed', post.videoId, err)
      );
    }
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
