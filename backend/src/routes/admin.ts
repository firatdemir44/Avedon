import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAdminAuth } from '../middleware/auth';
import { makeHandle } from './handle';
import { parseComposition } from '../domain/glossary';
import { COMPOSITION_AUTOPARSE_MIN_CONFIDENCE } from '../passport';

export const adminRouter = Router();

adminRouter.use(requireAdminAuth);

const handle = makeHandle('admin');

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
