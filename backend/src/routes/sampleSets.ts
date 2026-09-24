import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { normalizeLang, t, type Lang } from '../i18n';
import { LlmNotConfiguredError, LlmOutputError } from '../llm';
import { requireAuth } from '../middleware/auth';
import {
  CATALOG_SELECT,
  MAX_SUGGESTS_PER_DAY,
  loadCatalog,
  newShareToken,
  parseItems,
  shareUrl,
  suggestForBuyer,
  toPublicItem,
  toSetView,
  validateItems,
  type CatalogRow,
} from '../export/sampleSets';
import { makeHandle } from './handle';

// Kartela önerisi uçları (/api/export altında, oturum + firma gerekir).
export const sampleSetsRouter = Router();
sampleSetsRouter.use(requireAuth);
const handle = makeHandle('sampleSets');

sampleSetsRouter.post(
  '/buyers/:id/sample-set/suggest',
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.status(400).json({ error: 'no_company' });
    const buyer = await prisma.buyerCompany.findUnique({ where: { id: String(req.params.id) } });
    if (!buyer) return res.status(404).json({ error: 'not_found' });
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const today = await prisma.sampleSet.count({ where: { companyId, createdAt: { gte: since } } });
    if (today >= MAX_SUGGESTS_PER_DAY) return res.status(429).json({ error: 'daily_limit', max: MAX_SUGGESTS_PER_DAY });
    const catalog = await loadCatalog(companyId);
    if (catalog.length === 0) return res.status(400).json({ error: 'empty_catalog', message: t((req.lang ?? 'tr'), 'Kataloğunuzda ürün yok; önce ürün ekleyin.') });

    let output;
    try {
      output = (await suggestForBuyer(buyer, catalog, (req.lang ?? 'tr'))).output;
    } catch (err) {
      if (err instanceof LlmNotConfiguredError) return res.status(503).json({ error: 'llm_not_configured' });
      if (err instanceof LlmOutputError) return res.status(502).json({ error: 'llm_output' });
      throw err;
    }
    const items = validateItems(output.items, new Set(catalog.map((p) => p.id)));
    if (items.length === 0) return res.status(502).json({ error: 'no_suggestions' });
    const set = await prisma.sampleSet.create({
      data: {
        companyId,
        buyerId: buyer.id,
        title: t((req.lang ?? 'tr'), '{buyer} için kartela', { buyer: buyer.name }).slice(0, 120),
        itemsJson: JSON.stringify(items),
        summary: output.summary.trim().slice(0, 600),
        lang: (req.lang ?? 'tr'),
      },
    });
    res.json({ set: await toSetView(set, (req.lang ?? 'tr'), companyId) });
  })
);

sampleSetsRouter.get(
  '/sample-sets',
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.status(400).json({ error: 'no_company' });
    const buyerId = typeof req.query.buyerId === 'string' ? req.query.buyerId : undefined;
    const sets = await prisma.sampleSet.findMany({
      where: { companyId, ...(buyerId ? { buyerId } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: { buyer: { select: { name: true } } },
    });
    res.json({
      sets: sets.map((s) => {
        const items = parseItems(s.itemsJson);
        return {
          id: s.id,
          buyerId: s.buyerId,
          buyerName: s.buyer.name,
          title: s.title,
          status: s.status,
          itemCount: items.length,
          selectedCount: items.filter((i) => i.selected).length,
          shareUrl: s.shareToken ? shareUrl(s.shareToken) : null,
          updatedAt: s.updatedAt,
        };
      }),
    });
  })
);

async function ownSet(id: string, companyId: string) {
  const set = await prisma.sampleSet.findUnique({ where: { id } });
  return set && set.companyId === companyId ? set : null;
}

sampleSetsRouter.get(
  '/sample-sets/:id',
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.status(400).json({ error: 'no_company' });
    const set = await ownSet(String(req.params.id), companyId);
    if (!set) return res.status(404).json({ error: 'not_found' });
    res.json({ set: await toSetView(set, (req.lang ?? 'tr'), companyId) });
  })
);

const patchSchema = z.object({ selected: z.array(z.string()).max(50).optional(), title: z.string().trim().min(1).max(120).optional() }).strict();

sampleSetsRouter.patch(
  '/sample-sets/:id',
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.status(400).json({ error: 'no_company' });
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
    const set = await ownSet(String(req.params.id), companyId);
    if (!set) return res.status(404).json({ error: 'not_found' });
    const data: { title?: string; itemsJson?: string } = {};
    if (parsed.data.title) data.title = parsed.data.title;
    if (parsed.data.selected) {
      const chosen = new Set(parsed.data.selected);
      data.itemsJson = JSON.stringify(parseItems(set.itemsJson).map((i) => ({ ...i, selected: chosen.has(i.productId) })));
    }
    const updated = await prisma.sampleSet.update({ where: { id: set.id }, data });
    res.json({ set: await toSetView(updated, (req.lang ?? 'tr'), companyId) });
  })
);

sampleSetsRouter.post(
  '/sample-sets/:id/share',
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.status(400).json({ error: 'no_company' });
    const set = await ownSet(String(req.params.id), companyId);
    if (!set) return res.status(404).json({ error: 'not_found' });
    if (!parseItems(set.itemsJson).some((i) => i.selected)) return res.status(400).json({ error: 'nothing_selected' });
    const token = set.shareToken ?? newShareToken();
    if (!set.shareToken) await prisma.sampleSet.update({ where: { id: set.id }, data: { shareToken: token } });
    res.json({ url: shareUrl(token) });
  })
);

sampleSetsRouter.post(
  '/sample-sets/:id/sent',
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.status(400).json({ error: 'no_company' });
    const set = await ownSet(String(req.params.id), companyId);
    if (!set) return res.status(404).json({ error: 'not_found' });
    const [updated] = await prisma.$transaction([
      prisma.sampleSet.update({ where: { id: set.id }, data: { status: 'gonderildi' } }),
      prisma.buyerLead.upsert({
        where: { companyId_buyerId: { companyId, buyerId: set.buyerId } },
        create: { companyId, buyerId: set.buyerId, status: 'numune' },
        update: { status: 'numune' },
      }),
    ]);
    res.json({ set: await toSetView(updated, (req.lang ?? 'tr'), companyId), lead: { status: 'numune' } });
  })
);

// ---- Herkese açık (alıcı) görünümü: fiyat, stok, puan, gerekçe, özet YOK ----

export function buildPublicView(
  set: { title: string; itemsJson: string; lang: string; updatedAt: Date },
  companyName: string,
  buyerName: string,
  products: CatalogRow[],
  lang: Lang
) {
  const byId = new Map(products.map((p) => [p.id, p]));
  return {
    company: companyName,
    buyer: buyerName,
    // Varsayılan başlık alıcının dilinde; kullanıcının yazdığı başlık olduğu gibi.
    title: (['tr', 'en'] as const).some((l) => t(l, '{buyer} için kartela', { buyer: buyerName }) === set.title) ? t(lang, '{buyer} için kartela', { buyer: buyerName }) : set.title,
    lang,
    updatedAt: set.updatedAt,
    items: parseItems(set.itemsJson)
      .filter((i) => i.selected && byId.has(i.productId))
      .map((i) => toPublicItem(byId.get(i.productId)!, lang)),
  };
}

export const publicSampleSetsRouter = Router();
const publicHandle = makeHandle('publicSampleSets');

publicSampleSetsRouter.get(
  '/:token',
  publicHandle(async (req, res) => {
    const token = String(req.params.token);
    if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return res.status(404).json({ error: 'not_found' });
    const set = await prisma.sampleSet.findUnique({ where: { shareToken: token }, include: { company: { select: { name: true } }, buyer: { select: { name: true } } } });
    if (!set) return res.status(404).json({ error: 'not_found' });
    // Alıcı yabancı: ?lang yoksa İngilizce.
    const lang = typeof req.query.lang === 'string' ? normalizeLang(req.query.lang) : 'en';
    const ids = parseItems(set.itemsJson).map((i) => i.productId);
    const products = (await prisma.product.findMany({ where: { id: { in: ids }, companyId: set.companyId }, select: CATALOG_SELECT })) as unknown as CatalogRow[];
    res.set('Cache-Control', 'no-store');
    res.json(buildPublicView(set, set.company.name, set.buyer.name, products, lang));
  })
);
