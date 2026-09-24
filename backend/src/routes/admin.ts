import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAdminAuth } from '../middleware/auth';
import { makeHandle } from './handle';
import { enqueue, jobsFor } from '../export/buyers/sync';
import { hsGroup, type HsGroup } from '../export/buyers/segments';
import { companiesHouseKeySet } from '../export/buyers/sources/companiesHouse';
import { parseComposition } from '../domain/glossary';
import { COMPOSITION_AUTOPARSE_MIN_CONFIDENCE } from '../passport';
import { t } from '../i18n';
import { activateNumber, listNumbers, MetaError, registerNumber } from '../whatsappNumbers';
import { getWhatsAppStatus } from '../whatsapp';

export const adminRouter = Router();

adminRouter.use(requireAdminAuth);

const handle = makeHandle('admin');

// Akış şikâyetleri (feedRules.ts): açık şikâyetler gönderi bazında, kapanan firmalar.
adminRouter.get(
  '/feed-reports',
  handle(async (_req, res) => {
    const reports = await prisma.postReport.findMany({ where: { resolvedAt: null }, orderBy: { createdAt: 'desc' }, take: 300 });
    const postIds = [...new Set(reports.map((r) => r.postId))];
    const posts = postIds.length
      ? await prisma.post.findMany({
          where: { id: { in: postIds } },
          select: { id: true, body: true, hiddenAt: true, visibility: true, createdAt: true, productId: true, imageUrl: false, author: { select: { firstName: true, lastName: true, company: { select: { id: true, name: true } } } } },
        })
      : [];
    const blocked = await prisma.company.findMany({ where: { publicPostBlockedUntil: { gt: new Date() } }, select: { id: true, name: true, publicPostBlockedUntil: true } });
    res.json({
      posts: posts.map((p) => {
        const rs = reports.filter((r) => r.postId === p.id);
        return { ...p, reportCount: rs.length, reasons: [...new Set(rs.map((r) => r.reason))], notes: rs.map((r) => r.note).filter(Boolean).slice(0, 5), lastReportAt: rs[0]?.createdAt };
      }),
      blockedCompanies: blocked,
    });
  })
);
// Şikâyeti yersiz bul: gönderi geri açılır, şikâyetler kapanır.
adminRouter.post(
  '/posts/:id/restore',
  handle(async (req, res) => {
    await prisma.post.update({ where: { id: req.params.id }, data: { hiddenAt: null } });
    await prisma.postReport.updateMany({ where: { postId: req.params.id, resolvedAt: null }, data: { resolvedAt: new Date() } });
    res.json({ ok: true });
  })
);
// Şikâyeti haklı bul: gönderi gizli kalır, şikâyetler kapanır.
adminRouter.post(
  '/posts/:id/hide',
  handle(async (req, res) => {
    await prisma.post.update({ where: { id: req.params.id }, data: { hiddenAt: new Date() } });
    await prisma.postReport.updateMany({ where: { postId: req.params.id, resolvedAt: null }, data: { resolvedAt: new Date() } });
    res.json({ ok: true });
  })
);
adminRouter.post(
  '/companies/:id/unblock-public',
  handle(async (req, res) => {
    await prisma.company.update({ where: { id: req.params.id }, data: { publicPostBlockedUntil: null } });
    res.json({ ok: true });
  })
);

adminRouter.get('/companies', async (_req, res) => {
  const companies = await prisma.company.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { users: true, products: true } } },
  });
  res.json({ companies });
});

const updateVerificationSchema = z.object({
  verification: z.enum(['dogrulanmamis', 'inceleniyor', 'dogrulanmis']),
  // Faz 2 Adım 7: doğrulamanın nasıl yapıldığı (rozet açıklamasında gösterilir).
  level: z.enum(['', 'belge', 'ziyaret']).optional(),
});

adminRouter.patch('/companies/:id/verification', async (req, res) => {
  const parsed = updateVerificationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const company = await prisma.company.update({
    where: { id: req.params.id },
    data: {
      verification: parsed.data.verification,
      ...(parsed.data.verification === 'dogrulanmis'
        ? { verifiedAt: new Date(), ...(parsed.data.level !== undefined ? { verificationLevel: parsed.data.level } : {}) }
        : { verifiedAt: null, verificationLevel: '' }),
    },
  });
  res.json({ company });
});

// Pasaport geçişi (Faz 1, Adım 2): kompozisyonu olmayan mevcut ürünlerin
// `content` metnini sözlükle ayrıştırıp ProductComposition'a yazar. Render'da
// kabuk erişimi varsayılmıyor; bu uç panelden çağrılır. ?dryRun=1 ile yalnızca
// ne yapacağını listeler (CLAUDE.md: sonucu ölçebilecek teşhisi hazırla).
// Yazılan satırlar "parsed_content" kaynağıyla işaretlenir; sahibi ürün
// sayfasında görüp onaylar.
adminRouter.post(
  '/products/backfill-composition',
  handle(async (req, res) => {
    const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
    const products = await prisma.product.findMany({
      where: { compositions: { none: {} } },
      select: { id: true, code: true, content: true },
      orderBy: { createdAt: 'asc' },
    });

    const report: { id: string; code: string; content: string; action: 'write' | 'skip'; confidence: number; items?: unknown }[] = [];
    let written = 0;
    for (const product of products) {
      const parsed = parseComposition(product.content);
      const writable = parsed.items.length > 0 && parsed.confidence >= COMPOSITION_AUTOPARSE_MIN_CONFIDENCE;
      report.push({
        id: product.id,
        code: product.code,
        content: product.content,
        action: writable ? 'write' : 'skip',
        confidence: parsed.confidence,
        items: writable ? parsed.items : undefined,
      });
      if (!writable || dryRun) continue;
      await prisma.$transaction(async (tx) => {
        await tx.productComposition.createMany({
          data: parsed.items.map((item, position) => ({ productId: product.id, position, fiber: item.fiber, percent: item.percent })),
        });
        await tx.productFieldMeta.upsert({
          where: { productId_field: { productId: product.id, field: 'composition' } },
          create: { productId: product.id, field: 'composition', confidence: parsed.confidence, source: 'parsed_content' },
          update: { confidence: parsed.confidence, source: 'parsed_content', confirmedAt: null },
        });
        await tx.product.update({ where: { id: product.id }, data: { passportUpdatedAt: new Date() } });
      });
      written++;
    }

    res.json({
      dryRun,
      scanned: products.length,
      writable: report.filter((r) => r.action === 'write').length,
      written,
      report,
    });
  })
);

// Aday alıcı eşitlemesi elle (Dünyayı Keşfet B). Arka planda sıraya alınır.
const buyerSyncSchema = z.object({ source: z.enum(['sirene', 'wikidata', 'companies_house']), country: z.string().regex(/^[A-Z]{2}$/), hs6: z.string().regex(/^\d{6}$/).optional() }).strict();
adminRouter.post(
  '/buyers/sync',
  handle(async (req, res) => {
    const parsed = buyerSyncSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
    const { source, country, hs6 } = parsed.data;
    if (source === 'companies_house' && !companiesHouseKeySet()) return res.status(400).json({ error: 'companies_house_key_missing' });
    const groups: HsGroup[] = hs6 ? [hsGroup(hs6)] : ['iplik', 'kumas', 'giyim', 'ev'];
    const jobs = groups.flatMap((g) => jobsFor(country, g)).filter((j) => j.source === source);
    const unique = [...new Map(jobs.map((j) => [`${j.source}|${j.key}`, j])).values()];
    if (!unique.length) return res.status(400).json({ error: 'no_source_for_country' });
    enqueue(unique);
    res.json({ queued: unique.map((j) => j.key) });
  })
);

// WhatsApp numara yönetimi (2026-10-05): test numarasından gerçek numaraya geçiş (whatsappNumbers.ts).
// Meta hataları kullanıcıya Meta'nın kendi mesajıyla döner; PIN ve anahtar hiçbir yerde yazılmaz.
function metaFail(req: Request, res: Response, err: unknown) {
  if (err instanceof MetaError) {
    const code = err.httpStatus >= 400 && err.httpStatus < 600 ? err.httpStatus : 502;
    return res.status(code === 401 || code === 403 ? 502 : code).json({ error: 'meta_error', message: t(req.lang, err.message) });
  }
  if (err instanceof Error && /timeout|fetch failed|aborted/i.test(err.message)) {
    return res.status(502).json({ error: 'meta_unreachable', message: t(req.lang, "Meta'ya ulaşılamadı, biraz sonra tekrar deneyin.") });
  }
  throw err;
}

adminRouter.get(
  '/whatsapp/numbers',
  handle(async (req, res) => {
    try {
      const numbers = await listNumbers();
      const s = getWhatsAppStatus();
      res.json({ numbers, active: { id: s.activePhoneNumberId, source: s.activePhoneNumberSource, displayNumber: s.activeDisplayNumber }, mock: s.mock });
    } catch (err) {
      metaFail(req, res, err);
    }
  })
);

const registerSchema = z.object({ pin: z.string().regex(/^\d{6}$/) });
const numberIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

adminRouter.post(
  '/whatsapp/numbers/:id/register',
  handle(async (req, res) => {
    const id = numberIdSchema.safeParse(req.params.id);
    const body = registerSchema.safeParse(req.body);
    if (!id.success) return res.status(400).json({ error: 'invalid_id' });
    if (!body.success) return res.status(400).json({ error: 'invalid_pin', message: t(req.lang, 'PIN 6 haneli bir sayı olmalı.') });
    try {
      const result = await registerNumber(id.data, body.data.pin);
      res.json({ ok: true, result });
    } catch (err) {
      metaFail(req, res, err);
    }
  })
);

adminRouter.post(
  '/whatsapp/numbers/:id/activate',
  handle(async (req, res) => {
    const id = numberIdSchema.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: 'invalid_id' });
    try {
      const { diagnostics } = await activateNumber(id.data);
      const s = getWhatsAppStatus();
      res.json({ ok: true, active: { id: s.activePhoneNumberId, source: s.activePhoneNumberSource, displayNumber: s.activeDisplayNumber }, diagnostics });
    } catch (err) {
      metaFail(req, res, err);
    }
  })
);
