import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAdminAuth, requireAuth } from '../middleware/auth';
import { notify } from '../notifications';
import { makeHandle } from './handle';

// Firma doğrulama başvurusu (Fırat 2026-09-22). Firma tarafı: /api/verification
// (başvur, durumunu gör). Yönetici tarafı: /api/admin/verification-requests (liste, belge, karar).
// Yöneticinin kimliği hiçbir yanıtta yer almaz (bildirimler "Avedon" adına gider).
const MAX_DOC_CHARS = 2_100_000; // ~1,5 MB PDF ya da sıkıştırılmış fotoğraf

const handle = makeHandle('verification');

const REQUEST_SELECT = { id: true, companyId: true, userId: true, note: true, status: true, adminNote: true, createdAt: true, decidedAt: true } as const;

async function adminIds() {
  return (await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } })).map((u) => u.id);
}

// --- Firma tarafı ---
export const verificationRouter = Router();
verificationRouter.use(requireAuth);

const applySchema = z
  .object({
    document: z.union([z.string().startsWith('data:image/'), z.string().startsWith('data:application/pdf;base64,')]).refine((s) => s.length <= MAX_DOC_CHARS, 'document_too_large'),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

verificationRouter.get(
  '/',
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.status(400).json({ error: 'no_company' });
    const [company, latest] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId }, select: { verification: true, verificationLevel: true, verifiedAt: true } }),
      prisma.verificationRequest.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' }, select: REQUEST_SELECT }),
    ]);
    res.json({ verification: company?.verification ?? 'dogrulanmamis', level: company?.verificationLevel ?? '', verifiedAt: company?.verifiedAt ?? null, request: latest });
  })
);

verificationRouter.post(
  '/',
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.status(400).json({ error: 'no_company' });
    const parsed = applySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true, verification: true } });
    if (company.verification === 'dogrulanmis') return res.status(409).json({ error: 'already_verified' });
    const open = await prisma.verificationRequest.findFirst({ where: { companyId, status: 'pending' }, select: { id: true } });
    if (open) return res.status(409).json({ error: 'request_pending' });

    const row = await prisma.verificationRequest.create({
      data: { companyId, userId: req.user!.id, documentUrl: parsed.data.document, note: parsed.data.note ?? '' },
      select: REQUEST_SELECT,
    });
    await prisma.company.update({ where: { id: companyId }, data: { verification: 'inceleniyor' } });
    const admins = await adminIds();
    for (const adminId of admins) {
      await notify(adminId, { kind: 'verification_request', title: `Doğrulama başvurusu: ${company.name}`, body: 'Belgeyi inceleyip karar verin.', data: { companyId, verificationRequestId: row.id } });
    }
    res.status(201).json({ request: row });
  })
);

// --- Yönetici tarafı ---
export const adminVerificationRouter = Router();
adminVerificationRouter.use(requireAdminAuth);

adminVerificationRouter.get(
  '/',
  handle(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
    const rows = await prisma.verificationRequest.findMany({ where: status === 'all' ? {} : { status }, orderBy: { createdAt: 'desc' }, take: 100, select: REQUEST_SELECT });
    const companies = await prisma.company.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.companyId))] } }, select: { id: true, name: true, taxId: true, verification: true } });
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, firstName: true, lastName: true, position: true } });
    res.json({
      requests: rows.map((r) => ({ ...r, company: companies.find((c) => c.id === r.companyId) ?? null, user: users.find((u) => u.id === r.userId) ?? null })),
    });
  })
);

adminVerificationRouter.get(
  '/:id/document',
  handle(async (req, res) => {
    const row = await prisma.verificationRequest.findUnique({ where: { id: req.params.id }, select: { documentUrl: true } });
    if (!row) return res.status(404).json({ error: 'request_not_found' });
    res.json({ documentUrl: row.documentUrl });
  })
);

const decideSchema = z
  .object({ decision: z.enum(['approve', 'reject']), level: z.enum(['belge', 'ziyaret']).optional(), adminNote: z.string().trim().max(300).optional() })
  .strict();

adminVerificationRouter.post(
  '/:id/decide',
  handle(async (req, res) => {
    const parsed = decideSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const row = await prisma.verificationRequest.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'request_not_found' });
    if (row.status !== 'pending') return res.status(409).json({ error: 'already_decided' });
    const approve = parsed.data.decision === 'approve';
    const company = await prisma.company.findUniqueOrThrow({ where: { id: row.companyId }, select: { name: true } });

    await prisma.$transaction([
      prisma.verificationRequest.update({ where: { id: row.id }, data: { status: approve ? 'approved' : 'rejected', adminNote: parsed.data.adminNote ?? '', decidedAt: new Date(), documentUrl: '' } }),
      prisma.company.update({
        where: { id: row.companyId },
        data: approve ? { verification: 'dogrulanmis', verificationLevel: parsed.data.level ?? 'belge', verifiedAt: new Date() } : { verification: 'dogrulanmamis', verificationLevel: '', verifiedAt: null },
      }),
    ]);
    // Belge karar sonrası tutulmaz (kişisel/ticari veri en az süre saklanır).
    const members = await prisma.user.findMany({ where: { companyId: row.companyId }, select: { id: true } });
    for (const m of members) {
      await notify(m.id, {
        kind: approve ? 'verification_approved' : 'verification_rejected',
        title: approve ? `${company.name} doğrulandı` : 'Doğrulama başvurusu kabul edilmedi',
        body: approve ? 'Firma sayfanızda doğrulanmış rozeti görünüyor.' : parsed.data.adminNote || 'Belgeyi kontrol edip yeniden başvurabilirsiniz.',
        data: { companyId: row.companyId },
      });
    }
    res.json({ ok: true });
  })
);
