import { Router } from 'express';
import { tx } from '../i18n';
import { z } from 'zod';
import { prisma } from '../db';
import { LlmNotConfiguredError, LlmOutputError, isLlmConfigured, isLlmMock } from '../llm';
import { labelFibers } from '../labelMatch';
import { formatComposition, type CompositionItem } from '../domain/glossary';
import { runPassportExtract } from '../skills/passportExtract';
import { MAX_LOOK_SEARCHES_PER_DAY, findSimilarProducts, findSimilarWithLabel, lookView, refreshProductLook, usable } from '../looks';
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

const imageField = z.string().startsWith('data:image/').max(MAX_IMAGE_CHARS);
const searchSchema = z
  .object({ image: imageField.optional(), label: imageField.optional(), limit: z.number().int().min(1).max(30).optional() })
  .strict()
  .refine((b) => b.image || b.label, { message: 'image_or_label_required' });

interface LabelRead {
  read: boolean;
  compositionText: string;
  fibers: { key: string; label: string; percent: number }[];
  warnings: string[];
}

// Etiketten yalnızca kompozisyon işimize yarar. Sahte kipte görselin içeriği "LABEL:metin" ise o metin okunur (testler).
async function readLabel(image: { mediaType: string; data: string }): Promise<{ label: LabelRead; items: CompositionItem[] }> {
  let text: string | null = null;
  if (isLlmMock()) {
    const decoded = Buffer.from(image.data, 'base64').toString('utf8');
    if (decoded.startsWith('LABEL:')) text = decoded.slice(6);
  }
  const out = await runPassportExtract({
    images: text ? [] : [{ mediaType: image.mediaType as 'image/jpeg', data: image.data }],
    document: null,
    text,
    hints: {},
  });
  const items = (out.extraction.composition.value ?? []).filter((i) => i.percent > 0);
  if (!items.length) {
    return { items, label: { read: false, compositionText: '', fibers: [], warnings: ['Etiketteki içerik okunamadı; etiketi daha yakından ve net çekip tekrar deneyin.'] } };
  }
  return { items, label: { read: true, compositionText: formatComposition(items), fibers: labelFibers(items), warnings: [] } };
}

looksRouter.post(
  '/search',
  requireAuth,
  handle(async (req, res) => {
    const parsed = searchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    if (!isLlmConfigured()) return res.status(503).json({ error: 'llm_not_configured' });
    const image = parsed.data.image ? splitDataUrl(parsed.data.image) : null;
    const labelImage = parsed.data.label ? splitDataUrl(parsed.data.label) : null;
    if ((parsed.data.image && !image) || (parsed.data.label && !labelImage)) return res.status(400).json({ error: 'unsupported_image' });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const used = await prisma.lookSearch.count({ where: { userId: req.user!.id, createdAt: { gte: since } } });
    if (used >= MAX_LOOK_SEARCHES_PER_DAY) return res.status(429).json({ error: 'daily_limit', max: MAX_LOOK_SEARCHES_PER_DAY });
    const remaining = MAX_LOOK_SEARCHES_PER_DAY - used - 1;

    try {
      const [lookOut, labelOut] = await Promise.all([image ? extractFabricLook(image) : null, labelImage ? readLabel(labelImage) : null]);
      await prisma.lookSearch.create({ data: { userId: req.user!.id } });
      const look = lookOut?.look ?? null;
      const lookOk = look ? usable(look) : false;

      // Etiket yok ya da okunamadı: eski davranış (yalnızca görünüm).
      if (!labelOut || !labelOut.label.read) {
        const label = labelOut ? { ...labelOut.label, warnings: labelOut.label.warnings.map((w) => tx(req.lang, w)) } : null;
        if (!look) return res.json({ look: null, recognized: false, results: [], remaining, label });
        if (!lookOk) return res.json({ look: lookView(look), recognized: false, results: [], remaining, label });
        const results = await findSimilarProducts(look, { viewerCompanyId: req.user!.companyId, limit: parsed.data.limit });
        return res.json({ look: lookView(look), recognized: true, results, remaining, label });
      }

      const { results, warnings } = await findSimilarWithLabel(lookOk ? look : null, labelOut.items, { viewerCompanyId: req.user!.companyId, limit: parsed.data.limit });
      const labelWarnings = [...warnings];
      if (look && !lookOk) labelWarnings.push('Kumaş fotoğrafında kumaş seçilemedi; sonuçlar yalnızca etikete göre.');
      res.json({
        look: look ? lookView(look) : null,
        recognized: true,
        results,
        remaining,
        label: { ...labelOut.label, warnings: labelWarnings.map((w) => tx(req.lang, w)) },
      });
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
