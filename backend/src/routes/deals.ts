import { Router, type Request } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { notify, notifyMany } from '../notifications';
import { makeHandle } from './handle';

// Faz 3, Adım 4: sipariş kaydı ve karşılıklı değerlendirme. Kabul edilen tekliften doğar;
// platform ödeme almaz, sevkiyat izlemez: yalnızca iki tarafın beyanı. Ödeme konusuna girilmez.
export const dealsRouter = Router();
dealsRouter.use(requireAuth);
const handle = makeHandle('deals');

// Alıcı bu kadar gün yanıt vermezse satıcının teslim beyanı onaylanmış sayılır.
export const AUTO_CONFIRM_DAYS = 7;
// Değerlendirmeler iki taraf da yazınca ya da teslimden bu kadar gün sonra görünür.
export const REVIEW_REVEAL_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

const INCLUDE = { reviews: true } as const;
type DealRow = Prisma.DealGetPayload<{ include: typeof INCLUDE }>;

// Kabul edilen tekliften sipariş kaydı (quotes.ts çağırır). Aynı istek için ikinci kez oluşmaz.
export async function createDealFromAcceptedQuote(input: {
  quoteRequestId: string;
  quoteId: string;
  buyerId: string;
  buyerCompanyId: string | null;
  sellerCompanyId: string;
  productId: string;
  productCode: string;
  quantity: number;
  unit: string;
  leadTimeDays: number | null;
  targetDate: Date | null;
}) {
  const { leadTimeDays, targetDate, ...data } = input;
  const agreedDeliveryDate = leadTimeDays != null ? new Date(Date.now() + leadTimeDays * DAY) : targetDate;
  return prisma.deal.upsert({ where: { quoteRequestId: input.quoteRequestId }, create: { ...data, agreedDeliveryDate }, update: {} });
}

function roleOf(deal: { buyerId: string; sellerCompanyId: string }, user: NonNullable<Request['user']>): 'buyer' | 'seller' | null {
  if (deal.buyerId === user.id) return 'buyer';
  if (user.companyId && user.companyId === deal.sellerCompanyId) return 'seller';
  return null;
}

// Alıcı süresinde yanıt vermediyse teslim onaylanmış sayılır (okuma anında tembelce uygulanır).
async function settle(deal: DealRow): Promise<DealRow> {
  if (deal.status === 'teslim_bildirildi' && deal.sellerDeliveredAt && Date.now() - deal.updatedAt.getTime() > AUTO_CONFIRM_DAYS * DAY) {
    return prisma.deal.update({ where: { id: deal.id }, data: { status: 'teslim_edildi', buyerConfirmedAt: new Date(deal.updatedAt.getTime() + AUTO_CONFIRM_DAYS * DAY) }, include: INCLUDE });
  }
  return deal;
}

export function reviewsVisible(deal: { reviews: { authorRole: string }[]; buyerConfirmedAt: Date | null }) {
  if (deal.reviews.length >= 2) return true;
  return !!deal.buyerConfirmedAt && Date.now() - deal.buyerConfirmedAt.getTime() > REVIEW_REVEAL_DAYS * DAY;
}

export function lateDaysOf(deal: { agreedDeliveryDate: Date | null; sellerDeliveredAt: Date | null }) {
  if (!deal.agreedDeliveryDate || !deal.sellerDeliveredAt) return null;
  // Tam gün: anlaşılan günün içinde (24 saatten az farkla) yapılan teslim gecikme sayılmaz.
  return Math.max(0, Math.floor((deal.sellerDeliveredAt.getTime() - deal.agreedDeliveryDate.getTime()) / DAY));
}

function toReview(r: DealRow['reviews'][number]) {
  return { authorRole: r.authorRole, quality: r.quality, timing: r.timing, communication: r.communication, seriousness: r.seriousness, comment: r.comment, createdAt: r.createdAt };
}

async function toView(deal: DealRow, role: 'buyer' | 'seller') {
  const [seller, buyer] = await Promise.all([
    prisma.company.findUnique({ where: { id: deal.sellerCompanyId }, select: { id: true, name: true, verification: true } }),
    prisma.user.findUnique({ where: { id: deal.buyerId }, select: { id: true, firstName: true, lastName: true, company: { select: { id: true, name: true } } } }),
  ]);
  const mine = deal.reviews.find((r) => r.authorRole === role) ?? null;
  const theirs = deal.reviews.find((r) => r.authorRole !== role) ?? null;
  const visible = reviewsVisible(deal);
  return {
    id: deal.id,
    role,
    status: deal.status,
    quoteRequestId: deal.quoteRequestId,
    product: { id: deal.productId, code: deal.productCode },
    quantity: deal.quantity,
    unit: deal.unit,
    agreedDeliveryDate: deal.agreedDeliveryDate,
    sellerDeliveredAt: deal.sellerDeliveredAt,
    buyerConfirmedAt: deal.buyerConfirmedAt,
    lateDays: lateDaysOf(deal),
    disputeNote: deal.disputeNote,
    cancelledByRole: deal.cancelledByRole,
    cancelReason: deal.cancelReason,
    createdAt: deal.createdAt,
    sellerCompany: seller,
    buyer: buyer ? { id: buyer.id, name: `${buyer.firstName} ${buyer.lastName}`, company: buyer.company } : null,
    canReview: deal.status === 'teslim_edildi' && !mine,
    myReview: mine ? toReview(mine) : null,
    // Karşı tarafın değerlendirmesi, görünürlük kuralı sağlanana kadar içeriğiyle dönmez.
    theirReview: theirs && visible ? toReview(theirs) : null,
    theirReviewPending: !!theirs && !visible,
  };
}

async function loadFor(id: string, user: NonNullable<Request['user']>) {
  const found = await prisma.deal.findUnique({ where: { id }, include: INCLUDE });
  const role = found ? roleOf(found, user) : null;
  if (!found || !role) return null;
  return { deal: await settle(found), role };
}

const sellerUsers = (companyId: string) => prisma.user.findMany({ where: { companyId }, select: { id: true } }).then((rows) => rows.map((u) => u.id));

dealsRouter.get(
  '/',
  handle(async (req, res) => {
    const me = req.user!;
    const role = req.query.role === 'seller' ? 'seller' : 'buyer';
    if (role === 'seller' && !me.companyId) return res.json({ deals: [] });
    const rows = await prisma.deal.findMany({
      where: role === 'seller' ? { sellerCompanyId: me.companyId! } : { buyerId: me.id },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: INCLUDE,
    });
    const settled = await Promise.all(rows.map(settle));
    res.json({ deals: await Promise.all(settled.map((d) => toView(d, role))) });
  })
);

// Teklif isteğinden siparişe geçiş (teklif detay ekranı için).
dealsRouter.get(
  '/by-request/:quoteRequestId',
  handle(async (req, res) => {
    const found = await prisma.deal.findUnique({ where: { quoteRequestId: req.params.quoteRequestId }, select: { id: true } });
    const loaded = found ? await loadFor(found.id, req.user!) : null;
    if (!loaded) return res.status(404).json({ error: 'deal_not_found' });
    res.json({ deal: await toView(loaded.deal, loaded.role) });
  })
);

dealsRouter.get(
  '/:id',
  handle(async (req, res) => {
    const loaded = await loadFor(req.params.id, req.user!);
    if (!loaded) return res.status(404).json({ error: 'deal_not_found' });
    res.json({ deal: await toView(loaded.deal, loaded.role) });
  })
);

const deliverSchema = z.object({ deliveredAt: z.coerce.date().optional() }).strict();

// Satıcı: "teslim ettim" beyanı (itirazdan sonra yeniden beyan edilebilir).
dealsRouter.post(
  '/:id/deliver',
  handle(async (req, res) => {
    const parsed = deliverSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
    const loaded = await loadFor(req.params.id, req.user!);
    if (!loaded || loaded.role !== 'seller') return res.status(404).json({ error: 'deal_not_found' });
    if (loaded.deal.status !== 'acik' && loaded.deal.status !== 'itiraz') return res.status(409).json({ error: 'invalid_status', status: loaded.deal.status });
    const deliveredAt = parsed.data.deliveredAt ?? new Date();
    if (deliveredAt.getTime() > Date.now() + DAY) return res.status(400).json({ error: 'future_date' });
    if (deliveredAt.getTime() < loaded.deal.createdAt.getTime() - DAY) return res.status(400).json({ error: 'before_deal' });
    const deal = await prisma.deal.update({ where: { id: loaded.deal.id }, data: { status: 'teslim_bildirildi', sellerDeliveredAt: deliveredAt, disputeNote: '' }, include: INCLUDE });
    await notify(deal.buyerId, {
      kind: 'deal_delivered',
      title: `${deal.productCode}: satıcı teslim ettiğini bildirdi`,
      body: `Teslimi onaylayın ya da itiraz edin. ${AUTO_CONFIRM_DAYS} gün içinde yanıt vermezseniz onaylanmış sayılır.`,
      data: { dealId: deal.id, productId: deal.productId },
    });
    res.json({ deal: await toView(deal, 'seller') });
  })
);

// Alıcı: teslimi onayla.
dealsRouter.post(
  '/:id/confirm',
  handle(async (req, res) => {
    const loaded = await loadFor(req.params.id, req.user!);
    if (!loaded || loaded.role !== 'buyer') return res.status(404).json({ error: 'deal_not_found' });
    if (loaded.deal.status !== 'teslim_bildirildi') return res.status(409).json({ error: 'invalid_status', status: loaded.deal.status });
    const deal = await prisma.deal.update({ where: { id: loaded.deal.id }, data: { status: 'teslim_edildi', buyerConfirmedAt: new Date() }, include: INCLUDE });
    await notifyMany(await sellerUsers(deal.sellerCompanyId), {
      kind: 'deal_confirmed',
      title: `${deal.productCode}: alıcı teslimi onayladı`,
      body: 'İşi değerlendirebilirsiniz.',
      data: { dealId: deal.id, productId: deal.productId },
    });
    res.json({ deal: await toView(deal, 'buyer') });
  })
);

const disputeSchema = z.object({ note: z.string().trim().min(3).max(500) }).strict();

// Alıcı: teslim beyanına itiraz (ör. "henüz gelmedi", "eksik geldi"). Satıcı yeniden beyan edebilir.
dealsRouter.post(
  '/:id/dispute',
  handle(async (req, res) => {
    const parsed = disputeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
    const loaded = await loadFor(req.params.id, req.user!);
    if (!loaded || loaded.role !== 'buyer') return res.status(404).json({ error: 'deal_not_found' });
    if (loaded.deal.status !== 'teslim_bildirildi') return res.status(409).json({ error: 'invalid_status', status: loaded.deal.status });
    const deal = await prisma.deal.update({ where: { id: loaded.deal.id }, data: { status: 'itiraz', disputeNote: parsed.data.note }, include: INCLUDE });
    await notifyMany(await sellerUsers(deal.sellerCompanyId), {
      kind: 'deal_disputed',
      title: `${deal.productCode}: alıcı teslim beyanına itiraz etti`,
      body: parsed.data.note.slice(0, 120),
      data: { dealId: deal.id, productId: deal.productId },
    });
    res.json({ deal: await toView(deal, 'buyer') });
  })
);

const cancelSchema = z.object({ reason: z.string().trim().max(300).optional() }).strict();

// İki taraf da, teslim tamamlanmadan işi iptal olarak işaretleyebilir (değerlendirme açılmaz).
dealsRouter.post(
  '/:id/cancel',
  handle(async (req, res) => {
    const parsed = cancelSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
    const loaded = await loadFor(req.params.id, req.user!);
    if (!loaded) return res.status(404).json({ error: 'deal_not_found' });
    if (loaded.deal.status === 'teslim_edildi' || loaded.deal.status === 'iptal') return res.status(409).json({ error: 'invalid_status', status: loaded.deal.status });
    const deal = await prisma.deal.update({ where: { id: loaded.deal.id }, data: { status: 'iptal', cancelledByRole: loaded.role, cancelReason: parsed.data.reason ?? '' }, include: INCLUDE });
    const targets = loaded.role === 'buyer' ? await sellerUsers(deal.sellerCompanyId) : [deal.buyerId];
    await notifyMany(targets, {
      kind: 'deal_cancelled',
      title: `${deal.productCode}: sipariş iptal olarak işaretlendi`,
      body: parsed.data.reason ?? '',
      data: { dealId: deal.id, productId: deal.productId },
    });
    res.json({ deal: await toView(deal, loaded.role) });
  })
);

const score = z.number().int().min(1).max(5);
const buyerReviewSchema = z.object({ quality: score, timing: score, communication: score, comment: z.string().trim().max(500).optional() }).strict();
const sellerReviewSchema = z.object({ communication: score, seriousness: score, comment: z.string().trim().max(500).optional() }).strict();

dealsRouter.post(
  '/:id/review',
  handle(async (req, res) => {
    const loaded = await loadFor(req.params.id, req.user!);
    if (!loaded) return res.status(404).json({ error: 'deal_not_found' });
    const { deal, role } = loaded;
    if (deal.status !== 'teslim_edildi') return res.status(409).json({ error: 'not_completed', status: deal.status });
    if (deal.reviews.some((r) => r.authorRole === role)) return res.status(409).json({ error: 'already_reviewed' });
    const parsed = (role === 'buyer' ? buyerReviewSchema : sellerReviewSchema).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const d = parsed.data as { quality?: number; timing?: number; communication: number; seriousness?: number; comment?: string };
    await prisma.dealReview.create({
      data: {
        dealId: deal.id,
        authorRole: role,
        authorUserId: req.user!.id,
        targetCompanyId: role === 'buyer' ? deal.sellerCompanyId : deal.buyerCompanyId,
        quality: d.quality ?? null,
        timing: d.timing ?? null,
        communication: d.communication,
        seriousness: d.seriousness ?? null,
        comment: d.comment ?? '',
      },
    });
    const fresh = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id }, include: INCLUDE });
    const both = fresh.reviews.length >= 2;
    const targets = role === 'buyer' ? await sellerUsers(deal.sellerCompanyId) : [deal.buyerId];
    await notifyMany(targets, {
      kind: 'deal_review',
      title: `${deal.productCode}: karşı taraf işi değerlendirdi`,
      body: both ? 'İki değerlendirme de artık görünür.' : 'Siz de değerlendirince iki değerlendirme birlikte görünür olur.',
      data: { dealId: deal.id, productId: deal.productId },
    });
    res.status(201).json({ deal: await toView(fresh, role) });
  })
);
