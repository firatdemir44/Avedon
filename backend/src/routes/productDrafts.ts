import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { makeHandle } from './handle';

// WhatsApp'tan gönderilen etiket fotoğrafından hazırlanan ürün taslakları. Taslak ürün DEĞİLDİR:
// kullanıcı açar, onay ekranında kontrol eder, normal POST /products ile kaydeder; sonra taslağı
// "kullanıldı" işaretler. Taslağı yalnızca sahibi görür.
export const productDraftsRouter = Router();
productDraftsRouter.use(requireAuth);
const handle = makeHandle('product-drafts');

const parse = (json: string) => {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
};

productDraftsRouter.get(
  '/',
  handle(async (req, res) => {
    const rows = await prisma.productDraft.findMany({
      where: { userId: req.user!.id, status: 'new' },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, source: true, caption: true, createdAt: true, extractionJson: true },
    });
    // Liste hafif kalsın: fotoğraf dönmez; yalnızca okunan kod ve çeşit.
    res.json({
      drafts: rows.map((r) => {
        const x = parse(r.extractionJson)?.extraction;
        return { id: r.id, source: r.source, caption: r.caption, createdAt: r.createdAt, code: x?.code?.value ?? null, type: x?.type?.value ?? null, subtype: x?.subtype?.value ?? null };
      }),
    });
  })
);

productDraftsRouter.get(
  '/:id',
  handle(async (req, res) => {
    const row = await prisma.productDraft.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!row) return res.status(404).json({ error: 'draft_not_found' });
    res.json({ draft: { id: row.id, source: row.source, caption: row.caption, status: row.status, createdAt: row.createdAt, imageUrl: row.imageUrl, outcome: parse(row.extractionJson) } });
  })
);

for (const [path, status] of [
  ['used', 'used'],
  ['dismiss', 'dismissed'],
] as const) {
  productDraftsRouter.post(
    `/:id/${path}`,
    handle(async (req, res) => {
      const own = await prisma.productDraft.findFirst({ where: { id: req.params.id, userId: req.user!.id }, select: { id: true } });
      if (!own) return res.status(404).json({ error: 'draft_not_found' });
      // Kullanılan / vazgeçilen taslağın fotoğrafı ve çıkarımı tutulmaz (yer kaplamasın).
      await prisma.productDraft.update({ where: { id: own.id }, data: { status, imageUrl: '', extractionJson: '{}' } });
      res.status(204).end();
    })
  );
}
