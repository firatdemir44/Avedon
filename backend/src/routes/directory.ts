import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAdminAuth, requireAuth } from '../middleware/auth';
import { notify } from '../notifications';
import { COMPANY_TYPES } from '../catalog';
import { DIRECTORY_CATEGORIES, DIRECTORY_SELECT, MAX_IMPORT_ROWS, importCompanies, searchKey, toDirectoryRow } from '../directory';
import { makeHandle } from './handle';

const handle = makeHandle('directory');
const MAX_DOC_CHARS = 2_100_000;

// --- Rehber: /api/directory (oturumlu) ---
export const directoryRouter = Router();
directoryRouter.use(requireAuth);

const listSchema = z
  .object({
    category: z.enum(DIRECTORY_CATEGORIES).optional(),
    q: z.string().trim().max(80).optional(),
    claimed: z.enum(['all', 'claimed', 'unclaimed']).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();

directoryRouter.get(
  '/',
  handle(async (req, res) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_query' });
    const { category, q, claimed = 'all', offset = 0, limit = 30 } = parsed.data;
    // Arama: sadeleştirilmiş ada göre (Türkçe harf duyarsız). Kategori: ana tür ya da ek etiket.
    const key = q ? searchKey(q) : '';
    const where = {
      ...(key ? { OR: [{ normalizedName: { contains: key } }, { name: { contains: q } }] } : {}),
      ...(category ? { OR: [{ companyType: category }, { categoryTags: { contains: `"${category}"` } }] } : {}),
      ...(claimed === 'claimed' ? { claimed: true } : claimed === 'unclaimed' ? { claimed: false } : {}),
    };
    // Hem arama hem kategori varsa iki OR'u AND içine al (Prisma'da tek where'de iki OR olamaz).
    const finalWhere = key && category
      ? { AND: [{ OR: [{ normalizedName: { contains: key } }, { name: { contains: q } }] }, { OR: [{ companyType: category }, { categoryTags: { contains: `"${category}"` } }] }], ...(claimed === 'claimed' ? { claimed: true } : claimed === 'unclaimed' ? { claimed: false } : {}) }
      : where;
    const [rows, total, counts] = await Promise.all([
      // Sahipli ve doğrulanmış firmalar önce, sonra ada göre.
      prisma.company.findMany({ where: finalWhere, orderBy: [{ claimed: 'desc' }, { verification: 'asc' }, { name: 'asc' }], skip: offset, take: limit, select: DIRECTORY_SELECT }),
      prisma.company.count({ where: finalWhere }),
      prisma.company.groupBy({ by: ['companyType'], _count: { _all: true } }),
    ]);
    const countMap = new Map<string, number>(counts.map((c) => [c.companyType, c._count._all]));
    res.json({
      companies: rows.map(toDirectoryRow),
      total,
      nextOffset: offset + rows.length < total ? offset + rows.length : null,
      categories: COMPANY_TYPES.map((t) => ({ key: t.key, label: t.label, count: countMap.get(t.key) ?? 0 })),
    });
  })
);

const claimSchema = z
  .object({
    document: z.union([z.string().startsWith('data:image/'), z.string().startsWith('data:application/pdf;base64,')]).refine((s) => s.length <= MAX_DOC_CHARS, 'document_too_large'),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

// "Bu firma benim": firması olmayan, telefonu onaylı kullanıcı sahipsiz bir firmayı belgeyle
// sahiplenmek ister; yöneticinin onayıyla (verification decide) firmaya bağlanır.
directoryRouter.post(
  '/:id/claim',
  handle(async (req, res) => {
    const me = req.user!;
    if (me.companyId) return res.status(400).json({ error: 'already_has_company' });
    if (!me.phoneVerified) return res.status(403).json({ error: 'phone_not_verified' });
    const parsed = claimSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const company = await prisma.company.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, claimed: true } });
    if (!company) return res.status(404).json({ error: 'company_not_found' });
    if (company.claimed) return res.status(409).json({ error: 'already_claimed' });
    const pending = await prisma.verificationRequest.findFirst({ where: { companyId: company.id, status: 'pending' }, select: { userId: true } });
    if (pending) return res.status(409).json({ error: pending.userId === me.id ? 'request_pending' : 'claim_pending_by_other' });
    const row = await prisma.verificationRequest.create({
      data: { companyId: company.id, userId: me.id, documentUrl: parsed.data.document, note: parsed.data.note ?? '', claim: true },
      select: { id: true, status: true, createdAt: true },
    });
    await prisma.company.update({ where: { id: company.id }, data: { verification: 'inceleniyor' } });
    const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
    for (const a of admins) {
      await notify(a.id, { kind: 'verification_request', title: 'Firma sahiplenme: {company}', body: '{name} bu firmanın kendisine ait olduğunu belgeyle bildirdi.', vars: { company: company.name, name: `${me.firstName} ${me.lastName}` }, data: { companyId: company.id, verificationRequestId: row.id } });
    }
    res.status(201).json({ request: row });
  })
);

// Kullanıcının bekleyen sahiplenme başvurusu (rehber satırında "başvurunuz inceleniyor" için).
directoryRouter.get(
  '/my-claim',
  handle(async (req, res) => {
    const row = await prisma.verificationRequest.findFirst({ where: { userId: req.user!.id, claim: true }, orderBy: { createdAt: 'desc' }, select: { id: true, companyId: true, status: true, adminNote: true, createdAt: true, decidedAt: true } });
    res.json({ claim: row });
  })
);

// --- Yönetici: toplu içe aktarma /api/admin/directory/import ---
export const adminDirectoryRouter = Router();
adminDirectoryRouter.use(requireAdminAuth);

const importSchema = z
  .object({
    rows: z
      .array(
        z
          .object({
            name: z.string().trim().min(2).max(160),
            category: z.enum(DIRECTORY_CATEGORIES),
            city: z.string().trim().max(60).optional(),
            website: z.string().trim().max(200).optional(),
            source: z.string().trim().max(60).optional(),
            tags: z.array(z.enum(DIRECTORY_CATEGORIES)).max(5).optional(),
          })
          .strict()
      )
      .min(1)
      .max(MAX_IMPORT_ROWS),
  })
  .strict();

adminDirectoryRouter.post(
  '/import',
  handle(async (req, res) => {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    res.json(await importCompanies(parsed.data.rows));
  })
);
