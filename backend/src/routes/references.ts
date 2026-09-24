import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { notifyMany } from '../notifications';
import { makeHandle } from './handle';

// Faz 2, Adım 7: karşılıklı referans. Bir firma diğerini "müşterimiz" ya da
// "tedarikçimiz" olarak gösterir; karşı taraf onaylarsa iki firmanın sayfasında görünür.
// Onaylanmamış referans yalnızca iki tarafa görünür (tek taraflı iddia vitrine çıkmaz).
export const referencesRouter = Router();
const handle = makeHandle('references');

const RELATIONS = ['musteri', 'tedarikci'] as const;
const MAX_REFERENCES_PER_COMPANY = 50;

const COMPANY_SELECT = { id: true, name: true, city: true, verification: true, logoUpdatedAt: true } as const;
const INCLUDE = { fromCompany: { select: COMPANY_SELECT }, toCompany: { select: COMPANY_SELECT } } as const;

type Row = Awaited<ReturnType<typeof load>>;
function load(id: string) {
  return prisma.companyReference.findUnique({ where: { id }, include: INCLUDE });
}

// viewCompanyId sayfası görüntülenen firma: karşı taraf ve ilişkinin o firmaya göre okunuşu.
function toRow(r: NonNullable<Row>, viewCompanyId: string) {
  const outgoing = r.fromCompanyId === viewCompanyId;
  // from "to bizim müşterimiz" dediyse: from açısından to = müşteri; to açısından from = tedarikçi.
  const relationToViewer = outgoing ? r.relation : r.relation === 'musteri' ? 'tedarikci' : 'musteri';
  return {
    id: r.id,
    status: r.status,
    direction: outgoing ? 'given' : 'received',
    relation: relationToViewer,
    company: outgoing ? r.toCompany : r.fromCompany,
    note: r.note,
    createdAt: r.createdAt,
    respondedAt: r.respondedAt,
  };
}

// Firma sayfası: onaylı referanslar herkese; bekleyen/reddedilenler yalnızca o firmanın kullanıcılarına.
referencesRouter.get(
  '/company/:companyId',
  optionalAuth,
  handle(async (req, res) => {
    const companyId = req.params.companyId;
    const isOwn = !!req.user?.companyId && req.user.companyId === companyId;
    const rows = await prisma.companyReference.findMany({
      where: { OR: [{ fromCompanyId: companyId }, { toCompanyId: companyId }], ...(isOwn ? {} : { status: 'confirmed' }) },
      orderBy: { createdAt: 'desc' },
      include: INCLUDE,
    });
    const list = rows.map((r) => toRow(r, companyId));
    res.json({
      references: list.filter((r) => r.status === 'confirmed'),
      pendingIncoming: isOwn ? list.filter((r) => r.status === 'pending' && r.direction === 'received') : [],
      pendingOutgoing: isOwn ? list.filter((r) => r.status === 'pending' && r.direction === 'given') : [],
      confirmedCount: list.filter((r) => r.status === 'confirmed').length,
    });
  })
);

const createSchema = z.object({ toCompanyId: z.string().min(1), relation: z.enum(RELATIONS), note: z.string().trim().max(200).optional() }).strict();

referencesRouter.post(
  '/',
  requireAuth,
  handle(async (req, res) => {
    const me = req.user!;
    if (!me.companyId) return res.status(403).json({ error: 'no_company' });
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const { toCompanyId, relation } = parsed.data;
    if (toCompanyId === me.companyId) return res.status(400).json({ error: 'own_company' });
    const target = await prisma.company.findUnique({ where: { id: toCompanyId }, select: { id: true, name: true, users: { select: { id: true } } } });
    if (!target) return res.status(404).json({ error: 'company_not_found' });

    // Aynı ilişki iki yönden de tek kayıt: A "B müşterimiz" = B "A tedarikçimiz".
    const mirror = relation === 'musteri' ? 'tedarikci' : 'musteri';
    const existing = await prisma.companyReference.findFirst({
      where: { OR: [{ fromCompanyId: me.companyId, toCompanyId, relation }, { fromCompanyId: toCompanyId, toCompanyId: me.companyId, relation: mirror }] },
    });
    if (existing) return res.status(409).json({ error: 'already_exists', referenceId: existing.id, status: existing.status });
    const count = await prisma.companyReference.count({ where: { fromCompanyId: me.companyId } });
    if (count >= MAX_REFERENCES_PER_COMPANY) return res.status(409).json({ error: 'too_many_references', max: MAX_REFERENCES_PER_COMPANY });

    const created = await prisma.companyReference.create({
      data: { fromCompanyId: me.companyId, toCompanyId, relation, note: parsed.data.note ?? '', createdById: me.id },
      include: INCLUDE,
    });
    await notifyMany(
      target.users.map((u) => u.id),
      {
        kind: 'reference_request',
        title: 'Referans onayı bekleniyor',
        body: relation === 'musteri' ? '{company} sizi müşterisi olarak gösterdi.' : '{company} sizi tedarikçisi olarak gösterdi.',
        vars: { company: created.fromCompany.name },
        data: { referenceId: created.id, companyId: me.companyId },
      }
    );
    res.status(201).json({ reference: toRow(created, me.companyId) });
  })
);

const respondSchema = z.object({ action: z.enum(['confirm', 'reject']) }).strict();

referencesRouter.post(
  '/:id/respond',
  requireAuth,
  handle(async (req, res) => {
    const me = req.user!;
    const parsed = respondSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
    const row = await load(req.params.id);
    if (!row || !me.companyId || row.toCompanyId !== me.companyId) return res.status(404).json({ error: 'reference_not_found' });
    if (row.status !== 'pending') return res.status(409).json({ error: 'already_responded' });
    const confirmed = parsed.data.action === 'confirm';
    const updated = await prisma.companyReference.update({
      where: { id: row.id },
      data: { status: confirmed ? 'confirmed' : 'rejected', respondedAt: new Date() },
      include: INCLUDE,
    });
    const staff = await prisma.user.findMany({ where: { companyId: row.fromCompanyId }, select: { id: true } });
    await notifyMany(
      staff.map((u) => u.id),
      {
        kind: confirmed ? 'reference_confirmed' : 'reference_rejected',
        title: confirmed ? '{company} referansı onayladı' : '{company} referansı reddetti',
        vars: { company: row.toCompany.name },
        data: { referenceId: row.id, companyId: row.toCompanyId },
      }
    );
    res.json({ reference: toRow(updated, me.companyId) });
  })
);

// İki taraf da referansı kaldırabilir (onaylanmış olsa bile).
referencesRouter.delete(
  '/:id',
  requireAuth,
  handle(async (req, res) => {
    const me = req.user!;
    const row = await load(req.params.id);
    if (!row || !me.companyId || (row.fromCompanyId !== me.companyId && row.toCompanyId !== me.companyId)) {
      return res.status(404).json({ error: 'reference_not_found' });
    }
    await prisma.companyReference.delete({ where: { id: row.id } });
    res.status(204).end();
  })
);
