import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { PassportError, replacePassportRelations } from '../passport';
import { PRODUCT_SELECT, ProductImageError, replaceProductImages, toProductRow } from '../products';
import {
  YARN_OPTIONS,
  YARN_PRODUCT_TYPE,
  buildYarnWhere,
  compositionTotalError,
  countToDtex,
  createYarnSchema,
  updateYarnSchema,
  yarnQuerySchema,
  yarnSummary,
  type YarnQuery,
} from '../yarns';
import { formatComposition } from '../domain/glossary';
import { matchWatchRulesInBackground } from '../watch';
import { makeHandle } from './handle';

// Faz 2, Adım 6: iplik dizini. İplik bir Product satırıdır (type = "iplik") + YarnSpec;
// detay, fotoğraf, favori, teklif ve numune uçları /api/products altındakilerle ortaktır.
export const yarnsRouter = Router();
const handle = makeHandle('yarns');

yarnsRouter.get('/options', (_req, res) => {
  res.json(YARN_OPTIONS);
});

// Arama mantığı asistan aracıyla ortak (assistant/tools.ts iplik_ara).
export async function searchYarns(query: YarnQuery, viewerCompanyId: string | null) {
  const limit = query.limit ?? 20;
  const rows = await prisma.product.findMany({
    where: buildYarnWhere(query),
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    skip: query.offset ?? 0,
    select: PRODUCT_SELECT,
  });
  const hasMore = rows.length > limit;
  return {
    yarns: rows.slice(0, limit).map((p) => toProductRow(p, viewerCompanyId)),
    hasMore,
    nextOffset: hasMore ? (query.offset ?? 0) + limit : null,
  };
}

yarnsRouter.get(
  '/',
  optionalAuth,
  handle(async (req, res) => {
    const parsed = yarnQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_query', details: parsed.error.flatten() });
    const page = await searchYarns(parsed.data, req.user?.companyId ?? null);
    const ids = page.yarns.map((y) => y.id);
    const favorites = req.user && ids.length
      ? new Set((await prisma.productFavorite.findMany({ where: { userId: req.user.id, productId: { in: ids } }, select: { productId: true } })).map((f) => f.productId))
      : new Set<string>();
    res.json({ ...page, yarns: page.yarns.map((y) => ({ ...y, isFavorite: favorites.has(y.id) })) });
  })
);

const fieldError = (field: string, message: string) => ({ error: 'invalid_body', details: { fieldErrors: { [field]: [message] } } });

function contentOf(spec: Parameters<typeof yarnSummary>[0], composition: { fiber: string; percent: number }[]) {
  const blend = composition.length ? formatComposition(composition) : '';
  return [yarnSummary(spec), blend].filter(Boolean).join(' · ');
}

yarnsRouter.post(
  '/',
  requireAuth,
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.status(403).json({ error: 'no_company' });
    const parsed = createYarnSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const d = parsed.data;
    const totalError = compositionTotalError(d.composition);
    if (totalError) return res.status(400).json(fieldError('composition', totalError));

    const spec = {
      family: d.family,
      count: d.count,
      countUnit: d.countUnit,
      ply: d.ply,
      countDtex: countToDtex(d.count, d.countUnit),
      filaments: d.filaments ?? null,
      spinning: d.spinning,
      combing: d.combing,
      filamentType: d.filamentType,
      luster: d.luster,
      twistDirection: d.twistDirection,
      twistTpm: d.twistTpm ?? null,
      endUses: JSON.stringify([...new Set(d.endUses)]),
      colorState: d.colorState,
      color: d.color,
      variety: d.variety,
      origin: d.origin,
      brand: d.brand,
      coneWeightKg: d.coneWeightKg ?? null,
      sellerRole: d.sellerRole,
    };

    try {
      const product = await prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            companyId,
            code: d.code,
            type: YARN_PRODUCT_TYPE,
            stock: d.stock,
            stockUnit: 'kg',
            weightGsm: 0,
            widthCm: 0,
            content: contentOf(spec, d.composition),
            useArea: d.note,
            moq: d.moq ?? null,
            moqUnit: d.moq ? 'kg' : '',
            leadTimeDays: d.leadTimeDays ?? null,
            priceValue: d.priceValue ?? null,
            priceCurrency: d.priceValue ? d.priceCurrency || 'USD' : '',
            priceUnit: d.priceValue ? 'kg' : '',
            passportUpdatedAt: new Date(),
            yarnSpec: { create: spec },
          },
          select: { id: true },
        });
        await replaceProductImages(tx, created.id, d.images);
        await replacePassportRelations(tx, created.id, { composition: d.composition, certificates: d.certificates });
        return tx.product.findUniqueOrThrow({ where: { id: created.id }, select: PRODUCT_SELECT });
      });
      matchWatchRulesInBackground(product.id);
      res.status(201).json({ yarn: { ...toProductRow(product, companyId), isFavorite: false } });
    } catch (err) {
      if (err instanceof PassportError) return res.status(400).json(fieldError(err.field, err.message));
      throw err;
    }
  })
);

yarnsRouter.patch(
  '/:id',
  requireAuth,
  handle(async (req, res) => {
    const parsed = updateYarnSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const d = parsed.data;
    const existing = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: { companyId: true, type: true, priceCurrency: true, yarnSpec: true, compositions: { orderBy: { position: 'asc' }, select: { fiber: true, percent: true } } },
    });
    if (!existing || existing.type !== YARN_PRODUCT_TYPE || !existing.yarnSpec) return res.status(404).json({ error: 'yarn_not_found' });
    if (existing.companyId !== req.user!.companyId) return res.status(403).json({ error: 'not_your_company' });
    if (d.composition) {
      const totalError = compositionTotalError(d.composition);
      if (totalError) return res.status(400).json(fieldError('composition', totalError));
    }

    const cur = existing.yarnSpec;
    const count = d.count ?? cur.count;
    const countUnit = d.countUnit ?? cur.countUnit;
    const specUpdate: Prisma.YarnSpecUpdateInput = {
      ...(d.family !== undefined ? { family: d.family } : {}),
      count,
      countUnit,
      countDtex: countToDtex(count, countUnit),
      ...(d.ply !== undefined ? { ply: d.ply } : {}),
      ...(d.filaments !== undefined ? { filaments: d.filaments } : {}),
      ...(d.spinning !== undefined ? { spinning: d.spinning } : {}),
      ...(d.combing !== undefined ? { combing: d.combing } : {}),
      ...(d.filamentType !== undefined ? { filamentType: d.filamentType } : {}),
      ...(d.luster !== undefined ? { luster: d.luster } : {}),
      ...(d.twistDirection !== undefined ? { twistDirection: d.twistDirection } : {}),
      ...(d.twistTpm !== undefined ? { twistTpm: d.twistTpm } : {}),
      ...(d.endUses !== undefined ? { endUses: JSON.stringify([...new Set(d.endUses)]) } : {}),
      ...(d.colorState !== undefined ? { colorState: d.colorState } : {}),
      ...(d.color !== undefined ? { color: d.color } : {}),
      ...(d.variety !== undefined ? { variety: d.variety } : {}),
      ...(d.origin !== undefined ? { origin: d.origin } : {}),
      ...(d.brand !== undefined ? { brand: d.brand } : {}),
      ...(d.coneWeightKg !== undefined ? { coneWeightKg: d.coneWeightKg } : {}),
      ...(d.sellerRole !== undefined ? { sellerRole: d.sellerRole } : {}),
    };
    const merged = {
      family: d.family ?? cur.family,
      count,
      countUnit,
      ply: d.ply ?? cur.ply,
      filaments: d.filaments !== undefined ? d.filaments : cur.filaments,
      spinning: d.spinning ?? cur.spinning,
      combing: d.combing ?? cur.combing,
      filamentType: d.filamentType ?? cur.filamentType,
      variety: d.variety ?? cur.variety,
    };

    try {
      const product = await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: req.params.id },
          data: {
            ...(d.code !== undefined ? { code: d.code } : {}),
            ...(d.stock !== undefined ? { stock: d.stock } : {}),
            ...(d.note !== undefined ? { useArea: d.note } : {}),
            ...(d.moq !== undefined ? { moq: d.moq, moqUnit: d.moq ? 'kg' : '' } : {}),
            ...(d.leadTimeDays !== undefined ? { leadTimeDays: d.leadTimeDays } : {}),
            ...(d.priceValue !== undefined
              ? { priceValue: d.priceValue, priceUnit: d.priceValue ? 'kg' : '', priceCurrency: d.priceValue ? d.priceCurrency || existing.priceCurrency || 'USD' : '' }
              : d.priceCurrency
                ? { priceCurrency: d.priceCurrency }
                : {}),
            content: contentOf(merged, d.composition ?? existing.compositions),
            passportUpdatedAt: new Date(),
            yarnSpec: { update: specUpdate },
          },
        });
        if (d.images) await replaceProductImages(tx, req.params.id, d.images);
        await replacePassportRelations(tx, req.params.id, { composition: d.composition, certificates: d.certificates });
        return tx.product.findUniqueOrThrow({ where: { id: req.params.id }, select: PRODUCT_SELECT });
      });
      res.json({ yarn: toProductRow(product, req.user!.companyId) });
    } catch (err) {
      if (err instanceof PassportError) return res.status(400).json(fieldError(err.field, err.message));
      if (err instanceof ProductImageError) return res.status(400).json(fieldError('images', err.message));
      throw err;
    }
  })
);
