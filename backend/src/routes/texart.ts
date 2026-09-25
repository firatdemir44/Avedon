import express, { Router } from 'express';
import sharp from 'sharp';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { enqueueTexartJob } from '../texart/queue';
import { publicFilePath, saveOriginal } from '../texart/store';
import { makeHandle } from './handle';

// Takyon Texart API (TEXART.md §2):
//   POST /api/texart/jobs          görsel (ham gövde image/* ya da JSON { image: dataURL }) + ?productId → { job_id }
//   GET  /api/texart/jobs/:id      → { durum, ciktilar, olcumler, uyarilar, islem_kaydi }
//   GET  /api/texart/files/:id/:f  → dosya (orijinal + çıktılar; id tahmin edilemez cuid)
// firma_id oturumdan alınır (istemcinin gönderdiği değere güvenilmez).

export const texartRouter = Router();
const handle = makeHandle('texart');

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 50_000_000;
const FORMATS: Record<string, string> = { jpeg: 'jpg', png: 'png', webp: 'webp', heif: 'heic' };

function decodeBody(req: express.Request): Buffer | null {
  if (Buffer.isBuffer(req.body) && req.body.length) return req.body;
  const image = (req.body as { image?: unknown } | undefined)?.image;
  if (typeof image === 'string') {
    const m = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/i.exec(image);
    return Buffer.from(m ? m[1] : image, 'base64');
  }
  return null;
}

function fileUrl(req: express.Request, jobId: string, file: string) {
  return `${req.protocol}://${req.get('host')}/api/texart/files/${jobId}/${file}`;
}

texartRouter.post(
  '/jobs',
  requireAuth,
  express.raw({ type: ['image/*', 'application/octet-stream'], limit: MAX_BYTES }),
  handle(async (req, res) => {
    const user = req.user!;
    if (!user.companyId) return res.status(403).json({ error: 'no_company' });
    const buf = decodeBody(req);
    if (!buf || buf.length === 0) return res.status(400).json({ error: 'image_required' });
    if (buf.length > MAX_BYTES) return res.status(413).json({ error: 'image_too_large' });

    let meta: sharp.Metadata;
    try {
      meta = await sharp(buf).metadata();
    } catch {
      return res.status(400).json({ error: 'invalid_image' });
    }
    const ext = meta.format ? FORMATS[meta.format] : undefined;
    if (!ext || !meta.width || !meta.height) return res.status(400).json({ error: 'unsupported_image' });
    if (meta.width * meta.height > MAX_PIXELS) return res.status(413).json({ error: 'image_too_large' });

    const productId = typeof req.query.productId === 'string' ? req.query.productId : (req.body?.productId as string | undefined);
    if (productId) {
      const product = await prisma.product.findUnique({ where: { id: productId }, select: { companyId: true } });
      if (!product) return res.status(404).json({ error: 'product_not_found' });
      if (product.companyId !== user.companyId) return res.status(403).json({ error: 'not_your_company' });
    }

    const job = await prisma.texartJob.create({
      data: { companyId: user.companyId, productId: productId ?? null, createdById: user.id, originalName: `orijinal.${ext}` },
    });
    await saveOriginal(job.id, buf, ext);
    enqueueTexartJob(job.id);
    res.status(202).json({ job_id: job.id });
  })
);

texartRouter.get(
  '/jobs/:id',
  requireAuth,
  handle(async (req, res) => {
    const job = await prisma.texartJob.findUnique({ where: { id: req.params.id } });
    if (!job || (job.companyId !== req.user!.companyId && !req.user!.isAdmin)) return res.status(404).json({ error: 'job_not_found' });
    const outputs = JSON.parse(job.outputsJson) as { dosyalar?: Record<string, string>; renkler?: unknown };
    const files = outputs.dosyalar ?? {};
    res.json({
      job_id: job.id,
      durum: job.status,
      orijinal: fileUrl(req, job.id, job.originalName),
      ciktilar: {
        katalog: files.katalog ? fileUrl(req, job.id, files.katalog) : null,
        katalog_2x: files.katalog_2x ? fileUrl(req, job.id, files.katalog_2x) : null,
        yakin_plan: files.yakin_plan ? fileUrl(req, job.id, files.yakin_plan) : null,
        renk_cipi: files.renk_cipi ? fileUrl(req, job.id, files.renk_cipi) : null,
        renkler: outputs.renkler ?? [],
      },
      olcumler: JSON.parse(job.metricsJson),
      uyarilar: JSON.parse(job.warningsJson),
      islem_kaydi: JSON.parse(job.logJson),
      hata: job.error,
      karar: job.decision,
    });
  })
);

texartRouter.get('/files/:id/:file', (req, res) => {
  const p = publicFilePath(req.params.id, req.params.file);
  if (!p) return res.status(404).json({ error: 'file_not_found' });
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(p);
});
