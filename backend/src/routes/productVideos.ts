import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { makeHandle } from './handle';
import { MAX_PRODUCT_VIDEOS, checkClaimable, productVideos, removeLinkedVideo } from '../videoLinks';

// Ürün sayfası videoları: /api/products/:id/videos. Liste herkese açık (ürün sayfası gibi);
// oynatma adresi yine /api/videos/:id/playback'ten, oturumla alınır.
export const productVideosRouter = Router();
const handle = makeHandle('productVideos');

productVideosRouter.get(
  '/:id/videos',
  handle(async (req, res) => {
    res.json({ videos: await productVideos(req.params.id), max: MAX_PRODUCT_VIDEOS });
  })
);

const addSchema = z.object({ videoId: z.string().min(1) }).strict();

async function ownProduct(productId: string, companyId: string | null | undefined) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { companyId: true } });
  if (!product) return 'product_not_found' as const;
  if (!companyId || product.companyId !== companyId) return 'not_your_company' as const;
  return null;
}

productVideosRouter.post(
  '/:id/videos',
  requireAuth,
  handle(async (req, res) => {
    const parsed = addSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const denied = await ownProduct(req.params.id, req.user!.companyId);
    if (denied) return res.status(denied === 'product_not_found' ? 404 : 403).json({ error: denied });

    const count = await prisma.videoLink.count({ where: { productId: req.params.id } });
    if (count >= MAX_PRODUCT_VIDEOS) return res.status(409).json({ error: 'too_many_videos', max: MAX_PRODUCT_VIDEOS });
    const claim = await checkClaimable(req.user!.id, parsed.data.videoId);
    if (claim) return res.status(claim === 'video_not_found' ? 404 : 409).json({ error: claim });

    await prisma.videoLink.create({ data: { videoId: parsed.data.videoId, productId: req.params.id, sortOrder: count } });
    res.status(201).json({ videos: await productVideos(req.params.id), max: MAX_PRODUCT_VIDEOS });
  })
);

productVideosRouter.delete(
  '/:id/videos/:videoId',
  requireAuth,
  handle(async (req, res) => {
    const denied = await ownProduct(req.params.id, req.user!.companyId);
    if (denied) return res.status(denied === 'product_not_found' ? 404 : 403).json({ error: denied });
    const link = await prisma.videoLink.findFirst({ where: { videoId: req.params.videoId, productId: req.params.id } });
    if (!link) return res.status(404).json({ error: 'video_not_found' });
    await removeLinkedVideo(link.videoId);
    res.status(204).end();
  })
);
