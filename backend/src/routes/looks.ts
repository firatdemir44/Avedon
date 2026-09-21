import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { LlmNotConfiguredError, LlmOutputError, isLlmConfigured } from '../llm';
import { MAX_LOOK_SEARCHES_PER_DAY, findSimilarProducts, lookView, refreshProductLook, usable } from '../looks';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { extractFabricLook, splitDataUrl } from '../skills/fabricLook/run';
import { LOOK_OPTIONS, parseLook } from '../skills/fabricLook/schema';
import { makeHandle } from './handle';

// Faz 3, Adım 3: benzer kumaş arama. "Fotoğraf çek, benzerini bul" + ürün sayfasında
// "Benzer kumaşlar". Yalnızca GÖRÜNÜM eşleşir; gramaj ve lif fotoğraftan okunmaz.
export const looksRouter = Router();
const handle = makeHandle('looks');

const MAX_IMAGE_CHARS = 900_000;

looksRouter.get('/options', (_req, res) => {
  res.json(LOOK_OPTIONS);
});

const searchSchema = z.object({ image: z.string().startsWith('data:image/').max(MAX_IMAGE_CHARS), limit: z.number().int().min(1).max(30).optional() }).strict();

looksRouter.post(
  '/search',
  requireAuth,
  handle(async (req, res) => {
    const parsed = searchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    if (!isLlmConfigured()) return res.status(503).json({ error: 'llm_not_configured' });
    const image = splitDataUrl(parsed.data.image);
    if (!image) return res.status(400).json({ error: 'unsupported_image' });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const used = await prisma.lookSearch.count({ where: { userId: req.user!.id, createdAt: { gte: since } } });
    if (used >= MAX_LOOK_SEARCHES_PER_DAY) return res.status(429).json({ error: 'daily_limit', max: MAX_LOOK_SEARCHES_PER_DAY });

    try {
      const { look } = await extractFabricLook(image);
      await prisma.lookSearch.create({ data: { userId: req.user!.id } });
      if (!usable(look)) {
        return res.json({ look: lookView(look), recognized: false, results: [], remaining: MAX_LOOK_SEARCHES_PER_DAY - used - 1 });
      }
      const results = await findSimilarProducts(look, { viewerCompanyId: req.user!.companyId, limit: parsed.data.limit });
      res.json({ look: lookView(look), recognized: true, results, remaining: MAX_LOOK_SEARCHES_PER_DAY - used - 1 });
    } catch (err) {
      if (err instanceof LlmNotConfiguredError) return res.status(503).json({ error: 'llm_not_configured' });
      if (err instanceof LlmOutputError) return res.status(502).json({ error: 'look_failed' });
      throw err;
    }
  })
);

// Ürün sayfası: bu ürüne görünüşçe benzeyenler (model çağrısı yok; kayıtlı kartlar karşılaştırılır).
looksRouter.get(
  '/product/:id/similar',
  optionalAuth,
  handle(async (req, res) => {
    const product = await prisma.product.findUnique({ where: { id: req.params.id }, select: { id: true, type: true, weightGsm: true, look: { select: { lookJson: true } } } });
    if (!product) return res.status(404).json({ error: 'product_not_found' });
    const look = product.look ? parseLook(product.look.lookJson) : null;
    if (!look || !usable(look)) return res.json({ look: null, results: [] });
    const results = await findSimilarProducts(look, {
      excludeProductId: product.id,
      viewerCompanyId: req.user?.companyId ?? null,
      base: { type: product.type, weightGsm: product.weightGsm },
      limit: 8,
    });
    res.json({ look: lookView(look), results });
  })
);

// Sahibi, kartı elle yeniden çıkartabilir (fotoğraf aynıysa model çağrılmaz).
looksRouter.post(
  '/product/:id/refresh',
  requireAuth,
  handle(async (req, res) => {
    const product = await prisma.product.findUnique({ where: { id: req.params.id }, select: { companyId: true } });
    if (!product) return res.status(404).json({ error: 'product_not_found' });
    if (product.companyId !== req.user!.companyId) return res.status(403).json({ error: 'not_your_company' });
    try {
      res.json({ result: await refreshProductLook(req.params.id) });
    } catch (err) {
      if (err instanceof LlmNotConfiguredError) return res.status(503).json({ error: 'llm_not_configured' });
      if (err instanceof LlmOutputError) return res.status(502).json({ error: 'look_failed' });
      throw err;
    }
  })
);
