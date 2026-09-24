// Ürün toplu aktarımı: firma web sitesinden (tarama) ya da hazır dosyadan
// (Excel/CSV/PDF/fotoğraf). İkisi de aynı önizleme → seç → ekle akışını kullanır.
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { makeHandle } from './handle';
import { normalizeStartUrl, ScanError } from '../catalogImport/fetcher';
import { MAX_FILE_IMPORTS_PER_DAY, MAX_SCANS_PER_DAY, getJob, scansLeftToday, startCommit, startFileJob, startScan, toJobView } from '../catalogImport/jobs';
import { MAX_IMPORT_FILE_BYTES, splitImportFile } from '../catalogImport/fileImport';
import { isLlmConfigured } from '../llm';

export const catalogImportRouter = Router();
const handle = makeHandle('catalogImport');

const scanSchema = z.object({ url: z.string().trim().min(3).max(500) }).strict();
// base64 ~%33 büyür; 10 MB dosya ≈ 13,4 MB metin (express.json sınırı 15 MB).
const fileSchema = z
  .object({ file: z.string().max(Math.ceil((MAX_IMPORT_FILE_BYTES * 4) / 3) + 200), fileName: z.string().trim().max(200).default('') })
  .strict();
const commitSchema = z.object({ jobId: z.string().uuid(), keys: z.array(z.string().max(20)).min(1).max(500) }).strict();

catalogImportRouter.post(
  '/scan',
  requireAuth,
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.status(403).json({ error: 'no_company' });
    const parsed = scanSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    let url: string;
    try {
      url = normalizeStartUrl(parsed.data.url);
    } catch (err) {
      if (err instanceof ScanError || err instanceof TypeError) return res.status(400).json({ error: 'invalid_url' });
      throw err;
    }
    if (scansLeftToday(companyId, 'web') <= 0) return res.status(429).json({ error: 'daily_limit', max: MAX_SCANS_PER_DAY });
    const job = startScan({ companyId, userId: req.user!.id, url });
    res.status(202).json({ jobId: job.id });
  })
);

catalogImportRouter.post(
  '/file',
  requireAuth,
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.status(403).json({ error: 'no_company' });
    const parsed = fileSchema.safeParse(req.body);
    if (!parsed.success) {
      const tooBig = parsed.error.issues.some((i) => i.code === 'too_big' && i.path[0] === 'file');
      return res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'file_too_large' : 'invalid_body' });
    }
    const file = splitImportFile(parsed.data.file, parsed.data.fileName);
    if (!file) return res.status(400).json({ error: 'unsupported_file' });
    if ((file.kind === 'pdf' || file.kind === 'image') && !isLlmConfigured()) return res.status(503).json({ error: 'llm_not_configured' });
    if (scansLeftToday(companyId, 'file') <= 0) return res.status(429).json({ error: 'daily_limit', max: MAX_FILE_IMPORTS_PER_DAY });
    const job = startFileJob({ companyId, userId: req.user!.id, fileName: parsed.data.fileName, file });
    res.status(202).json({ jobId: job.id });
  })
);

catalogImportRouter.get(
  '/scan/:jobId',
  requireAuth,
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.status(403).json({ error: 'no_company' });
    const job = getJob(req.params.jobId, companyId);
    if (!job) return res.status(404).json({ error: 'job_not_found' });
    res.json(toJobView(job));
  })
);

// Kayıt da arka planda (fotoğraflar sıra ile, istekler arası beklemeyle iner);
// ilerleme ve sonuç (created/skipped) GET /scan/:jobId'deki `commit` alanında.
catalogImportRouter.post(
  '/commit',
  requireAuth,
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.status(403).json({ error: 'no_company' });
    const parsed = commitSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const job = getJob(parsed.data.jobId, companyId);
    if (!job) return res.status(404).json({ error: 'job_not_found' });
    if (job.status !== 'ready' && job.status !== 'done') return res.status(409).json({ error: 'job_busy', status: job.status });
    startCommit(job, parsed.data.keys);
    res.status(202).json({ status: 'committing', total: parsed.data.keys.length });
  })
);
