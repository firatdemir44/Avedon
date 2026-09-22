import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { notify, notifyMany } from '../notifications';
import { PRICE_CURRENCIES, PRODUCT_TYPES, STOCK_UNITS, TYPE_LABELS } from '../catalog';
import { YARN_COUNT_UNITS, YARN_FAMILIES } from '../yarns';
import { makeHandle } from './handle';

// Açık talep / ihale (Fırat 2026-09-23): alıcı ürüne bağlı olmadan ihtiyacını yayınlar,
// kategoriye uyan tüm satıcılar teklif verir, alıcı karşılaştırıp seçer. Talep akışta kart
// olarak da görünür (Post.tenderId). Platform fiyat vermez, yalnızca aracı olur.
export const tendersRouter = Router();
tendersRouter.use(requireAuth);
const handle = makeHandle('tenders');

export const MAX_TENDERS_PER_DAY = 10;
export const MAX_TENDER_NOTIFY = 200;
const DAY = 24 * 60 * 60 * 1000;

const CATEGORIES = ['iplik', 'kumas', 'diger'] as const;
export type TenderCategory = (typeof CATEGORIES)[number];
export const CATEGORY_LABELS: Record<TenderCategory, string> = { iplik: 'İplik', kumas: 'Kumaş', diger: 'Diğer' };
const familyKeys = YARN_FAMILIES.map((f) => f.key) as [string, ...string[]];
const countUnitKeys = YARN_COUNT_UNITS.map((u) => u.key) as [string, ...string[]];

// Kategoriye göre yapılandırılmış özellikler; hepsi isteğe bağlı, serbest metin `note`'ta.
const yarnSpecSchema = z
  .object({
    family: z.enum(familyKeys).optional(),
    filaments: z.number().int().min(1).max(10000).optional(),
    count: z.number().positive().max(100000).optional(),
    countUnit: z.enum(countUnitKeys).optional(),
    colorState: z.enum(['', 'ham', 'boyali', 'ekru']).optional(),
    color: z.string().trim().max(60).optional(),
  })
  .strict();
const fabricSpecSchema = z
  .object({
    type: z.enum(PRODUCT_TYPES).optional(),
    subtype: z.string().trim().max(40).optional(),
    weightGsm: z.number().positive().max(5000).optional(),
    widthCm: z.number().positive().max(1000).optional(),
    content: z.string().trim().max(120).optional(),
    color: z.string().trim().max(60).optional(),
  })
  .strict();

const createSchema = z
  .object({
    category: z.enum(CATEGORIES),
    title: z.string().trim().min(3).max(120),
    spec: z.record(z.string(), z.unknown()).optional(),
    quantity: z.number().positive().max(1e9),
    unit: z.enum(['kg', 'm', 'ton', 'adet']),
    targetDate: z.string().datetime().optional().nullable(),
    deadline: z.string().datetime().optional().nullable(),
    note: z.string().trim().max(1000).optional(),
    // Akışta da paylaşılsın mı (varsayılan evet).
    shareToFeed: z.boolean().optional(),
  })
  .strict();

function parseSpec(category: TenderCategory, spec: unknown) {
  if (category === 'iplik') return yarnSpecSchema.safeParse(spec ?? {});
  if (category === 'kumas') return fabricSpecSchema.safeParse(spec ?? {});
  return z.object({}).strict().safeParse({});
}

const formatQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1)).replace('.', ',');

// Kart ve liste metni: "Polyester · 96 filament · 150 Denye · 7 ton"
export function tenderSummary(t: { category: string; specJson: string; quantity: number; unit: string }) {
  let spec: Record<string, unknown> = {};
  try {
    spec = JSON.parse(t.specJson);
  } catch {
    spec = {};
  }
  const parts: string[] = [];
  if (t.category === 'iplik') {
    const fam = YARN_FAMILIES.find((f) => f.key === spec.family);
    if (fam) parts.push(fam.label.split(' (')[0]);
    if (spec.filaments) parts.push(`${spec.filaments} filament`);
    if (spec.count) parts.push(`${spec.count} ${YARN_COUNT_UNITS.find((u) => u.key === spec.countUnit)?.label ?? ''}`.trim());
    if (spec.colorState === 'ham') parts.push('ham');
    if (spec.colorState === 'boyali') parts.push(spec.color ? `boyalı · ${spec.color}` : 'boyalı');
  } else if (t.category === 'kumas') {
    if (spec.type) parts.push(TYPE_LABELS[spec.type as keyof typeof TYPE_LABELS] ?? String(spec.type));
    if (spec.subtype) parts.push(String(spec.subtype));
    if (spec.weightGsm) parts.push(`${spec.weightGsm} gr/m²`);
    if (spec.widthCm) parts.push(`${spec.widthCm} cm`);
    if (spec.content) parts.push(String(spec.content));
  }
  parts.push(`${formatQty(t.quantity)} ${t.unit}`);
  return parts.join(' · ');
}

type TenderRow = Awaited<ReturnType<typeof prisma.tender.findFirstOrThrow>>;
type OfferRow = Awaited<ReturnType<typeof prisma.tenderOffer.findFirstOrThrow>>;
type PartyInfo = { id: string; name: string; company: unknown };

async function partyInfo(ids: string[]) {
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true, company: { select: { id: true, name: true, verification: true, logoUpdatedAt: true } } },
  });
  return new Map<string, PartyInfo>(users.map((u) => [u.id, { id: u.id, name: `${u.firstName} ${u.lastName}`, company: u.company }]));
}

export function toTenderView(t: TenderRow, buyer: PartyInfo | undefined, offerCount: number, viewer: { id: string; companyId: string | null }) {
  let spec: Record<string, unknown> = {};
  try {
    spec = JSON.parse(t.specJson);
  } catch {
    spec = {};
  }
  const expired = !!t.deadline && t.deadline.getTime() < Date.now();
  return {
    id: t.id,
    category: t.category,
    categoryLabel: CATEGORY_LABELS[t.category as TenderCategory] ?? t.category,
    title: t.title,
    spec,
    summary: tenderSummary(t),
    quantity: t.quantity,
    unit: t.unit,
    targetDate: t.targetDate,
    deadline: t.deadline,
    note: t.note,
    status: t.status,
    expired,
    // Süresi dolmuş açık talebe teklif verilmez.
    acceptingOffers: t.status === 'open' && !expired,
    offerCount,
    awardedOfferId: t.awardedOfferId,
    postId: t.postId,
    createdAt: t.createdAt,
    buyer: buyer ?? null,
    isMine: t.buyerId === viewer.id,
  };
}

function toOfferView(o: OfferRow, seller: PartyInfo | undefined, showSeller: boolean) {
  return {
    id: o.id,
    tenderId: o.tenderId,
    price: { value: o.priceValue, currency: o.priceCurrency, unit: o.priceUnit },
    moq: o.moq,
    moqUnit: o.moqUnit,
    leadTimeDays: o.leadTimeDays,
    validUntil: o.validUntil,
    paymentTerms: o.paymentTerms,
    note: o.note,
    status: o.status,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    // Satıcı kimliği yalnızca alıcıya ve satıcının kendisine.
    seller: showSeller ? seller ?? null : null,
    sellerCompanyId: o.sellerCompanyId,
  };
}

// Kategoriye uyan satıcılar: iplikte o lifi (ya da herhangi bir ipliği) satan firmalar + iplik
// üreticisi firma tipi; kumaşta o çeşitten ürünü olan firmalar + kumaş üreticileri. Alıcının
// kendi firması hariç. Sınırlı (MAX_TENDER_NOTIFY); firmanın tüm kullanıcılarına gider.
async function matchingSellerUserIds(category: TenderCategory, spec: Record<string, unknown>, excludeCompanyId: string | null, excludeUserId: string) {
  const companyIds = new Set<string>();
  const addCompanies = (rows: { id: string }[]) => rows.forEach((c) => companyIds.add(c.id));
  if (category === 'iplik') {
    const yarnCos = await prisma.product.findMany({
      where: { type: 'iplik', ...(spec.family ? { yarnSpec: { family: String(spec.family) } } : {}) },
      select: { companyId: true },
      distinct: ['companyId'],
      take: MAX_TENDER_NOTIFY,
    });
    yarnCos.forEach((p) => companyIds.add(p.companyId));
    addCompanies(await prisma.company.findMany({ where: { companyType: 'iplik' }, select: { id: true }, take: MAX_TENDER_NOTIFY }));
  } else if (category === 'kumas') {
    const cos = await prisma.product.findMany({
      where: { type: spec.type ? String(spec.type) : { not: 'iplik' } },
      select: { companyId: true },
      distinct: ['companyId'],
      take: MAX_TENDER_NOTIFY,
    });
    cos.forEach((p) => companyIds.add(p.companyId));
    addCompanies(await prisma.company.findMany({ where: { companyType: 'kumas_uretici' }, select: { id: true }, take: MAX_TENDER_NOTIFY }));
  } else {
    addCompanies(await prisma.company.findMany({ where: { companyType: { in: ['toptanci', 'aksesuar', 'boyahane', 'baski'] } }, select: { id: true }, take: MAX_TENDER_NOTIFY }));
  }
  if (excludeCompanyId) companyIds.delete(excludeCompanyId);
  if (!companyIds.size) return [];
  const users = await prisma.user.findMany({ where: { companyId: { in: [...companyIds] }, id: { not: excludeUserId } }, select: { id: true }, take: MAX_TENDER_NOTIFY });
  return users.map((u) => u.id);
}

const listSchema = z
  .object({
    category: z.enum(CATEGORIES).optional(),
    scope: z.enum(['open', 'mine', 'offered']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

async function offerCounts(ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const rows = await prisma.tenderOffer.groupBy({ by: ['tenderId'], where: { tenderId: { in: ids }, status: { not: 'withdrawn' } }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.tenderId, r._count._all]));
}

// Liste: açık talepler (herkes), benimkiler, teklif verdiklerim.
tendersRouter.get(
  '/',
  handle(async (req, res) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_query' });
    const { category, scope = 'open', limit = 50 } = parsed.data;
    const me = req.user!;
    let where: Record<string, unknown> = {};
    if (scope === 'mine') where = { buyerId: me.id };
    else if (scope === 'offered') {
      if (!me.companyId) return res.json({ tenders: [] });
      const offered = await prisma.tenderOffer.findMany({ where: { sellerCompanyId: me.companyId }, select: { tenderId: true }, take: 200 });
      where = { id: { in: offered.map((o) => o.tenderId) } };
    } else where = { status: 'open', OR: [{ deadline: null }, { deadline: { gte: new Date() } }] };
    if (category) where = { ...where, category };
    const rows = await prisma.tender.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit });
    const [buyers, counts] = await Promise.all([partyInfo([...new Set(rows.map((r) => r.buyerId))]), offerCounts(rows.map((r) => r.id))]);
    // Satıcı görünümü: hangi taleplere kendi firmam teklif verdi.
    const mine = me.companyId
      ? new Set((await prisma.tenderOffer.findMany({ where: { sellerCompanyId: me.companyId, tenderId: { in: rows.map((r) => r.id) } }, select: { tenderId: true } })).map((o) => o.tenderId))
      : new Set<string>();
    res.json({ tenders: rows.map((r) => ({ ...toTenderView(r, buyers.get(r.buyerId), counts.get(r.id) ?? 0, me), myCompanyOffered: mine.has(r.id) })) });
  })
);

tendersRouter.post(
  '/',
  handle(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const d = parsed.data;
    const spec = parseSpec(d.category, d.spec);
    if (!spec.success) return res.status(400).json({ error: 'invalid_spec', details: spec.error.flatten() });
    const me = req.user!;
    const today = await prisma.tender.count({ where: { buyerId: me.id, createdAt: { gte: new Date(Date.now() - DAY) } } });
    if (today >= MAX_TENDERS_PER_DAY) return res.status(429).json({ error: 'daily_limit', max: MAX_TENDERS_PER_DAY });

    let tender = await prisma.tender.create({
      data: {
        buyerId: me.id,
        buyerCompanyId: me.companyId ?? null,
        category: d.category,
        title: d.title,
        specJson: JSON.stringify(spec.data),
        quantity: d.quantity,
        unit: d.unit,
        targetDate: d.targetDate ? new Date(d.targetDate) : null,
        deadline: d.deadline ? new Date(d.deadline) : null,
        note: d.note ?? '',
      },
    });
    // Akış kartı: herkese açık gönderi; kart metni istemcide talep özetinden çizilir.
    if (d.shareToFeed !== false) {
      const post = await prisma.post.create({ data: { authorId: me.id, body: '', visibility: 'public', tenderId: tender.id } });
      tender = await prisma.tender.update({ where: { id: tender.id }, data: { postId: post.id } });
    }
    const sellers = await matchingSellerUserIds(d.category, spec.data as Record<string, unknown>, me.companyId ?? null, me.id);
    if (sellers.length) {
      await notifyMany(sellers, {
        kind: 'tender_new',
        title: `Açık talep: ${d.title}`,
        body: `${tenderSummary(tender)} · Teklif verebilirsiniz.`,
        data: { tenderId: tender.id },
      });
    }
    const buyers = await partyInfo([me.id]);
    res.status(201).json({ tender: toTenderView(tender, buyers.get(me.id), 0, me), notified: sellers.length });
  })
);

async function loadTender(req: Request) {
  return prisma.tender.findUnique({ where: { id: req.params.id } });
}

tendersRouter.get(
  '/:id',
  handle(async (req, res) => {
    const t = await loadTender(req);
    if (!t) return res.status(404).json({ error: 'tender_not_found' });
    const me = req.user!;
    const isBuyer = t.buyerId === me.id;
    // Alıcı tüm teklifleri (geri çekilenler hariç), satıcı yalnızca kendi firmasınınkini görür.
    const offers = await prisma.tenderOffer.findMany({
      where: { tenderId: t.id, ...(isBuyer ? { status: { not: 'withdrawn' } } : { sellerCompanyId: me.companyId ?? '' }) },
      orderBy: { createdAt: 'asc' },
    });
    const sellers = await partyInfo([...new Set(offers.map((o) => o.sellerUserId))]);
    const buyers = await partyInfo([t.buyerId]);
    const count = (await offerCounts([t.id])).get(t.id) ?? 0;
    const myOffer = !isBuyer ? offers.find((o) => o.sellerCompanyId === me.companyId) ?? null : null;
    res.json({
      tender: toTenderView(t, buyers.get(t.buyerId), count, me),
      offers: offers.map((o) => toOfferView(o, sellers.get(o.sellerUserId), isBuyer || o.sellerCompanyId === me.companyId)),
      myOffer: myOffer ? toOfferView(myOffer, sellers.get(myOffer.sellerUserId), true) : null,
    });
  })
);

const offerSchema = z
  .object({
    priceValue: z.number().positive().max(1e9),
    priceCurrency: z.enum(PRICE_CURRENCIES),
    priceUnit: z.enum([...STOCK_UNITS, 'ton', 'adet']),
    moq: z.number().positive().optional().nullable(),
    moqUnit: z.string().trim().max(10).optional(),
    leadTimeDays: z.number().int().min(0).max(3650).optional().nullable(),
    validUntil: z.string().datetime().optional().nullable(),
    paymentTerms: z.string().trim().max(200).optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

// Teklif ver / güncelle (firma başına bir teklif).
tendersRouter.post(
  '/:id/offers',
  handle(async (req, res) => {
    const me = req.user!;
    if (!me.companyId) return res.status(400).json({ error: 'no_company' });
    const t = await loadTender(req);
    if (!t) return res.status(404).json({ error: 'tender_not_found' });
    if (t.buyerId === me.id || t.buyerCompanyId === me.companyId) return res.status(400).json({ error: 'own_tender' });
    if (t.status !== 'open' || (t.deadline && t.deadline.getTime() < Date.now())) return res.status(409).json({ error: 'tender_closed' });
    const parsed = offerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const d = parsed.data;
    const data = {
      sellerUserId: me.id,
      priceValue: d.priceValue,
      priceCurrency: d.priceCurrency,
      priceUnit: d.priceUnit,
      moq: d.moq ?? null,
      moqUnit: d.moqUnit ?? '',
      leadTimeDays: d.leadTimeDays ?? null,
      validUntil: d.validUntil ? new Date(d.validUntil) : null,
      paymentTerms: d.paymentTerms ?? '',
      note: d.note ?? '',
      status: 'sent',
    };
    const existing = await prisma.tenderOffer.findUnique({ where: { tenderId_sellerCompanyId: { tenderId: t.id, sellerCompanyId: me.companyId } } });
    const offer = existing
      ? await prisma.tenderOffer.update({ where: { id: existing.id }, data })
      : await prisma.tenderOffer.create({ data: { ...data, tenderId: t.id, sellerCompanyId: me.companyId } });
    const company = await prisma.company.findUnique({ where: { id: me.companyId }, select: { name: true } });
    await notify(t.buyerId, {
      kind: 'tender_offer',
      title: `${company?.name ?? 'Bir firma'} teklif verdi: ${t.title}`,
      body: `${d.priceValue} ${d.priceCurrency}/${d.priceUnit}${d.leadTimeDays != null ? ` · ${d.leadTimeDays} gün` : ''}`,
      data: { tenderId: t.id },
    });
    res.status(existing ? 200 : 201).json({ offer: toOfferView(offer, undefined, false), updated: !!existing });
  })
);

tendersRouter.delete(
  '/:id/offers/mine',
  handle(async (req, res) => {
    const me = req.user!;
    if (!me.companyId) return res.status(400).json({ error: 'no_company' });
    const r = await prisma.tenderOffer.updateMany({ where: { tenderId: req.params.id, sellerCompanyId: me.companyId, status: 'sent' }, data: { status: 'withdrawn' } });
    if (!r.count) return res.status(404).json({ error: 'offer_not_found' });
    res.status(204).end();
  })
);

// Alıcı bir teklifi seçer: talep "awarded", seçilen kabul, diğerleri reddedildi; herkese haber.
tendersRouter.post(
  '/:id/offers/:offerId/accept',
  handle(async (req, res) => {
    const me = req.user!;
    const t = await loadTender(req);
    if (!t) return res.status(404).json({ error: 'tender_not_found' });
    if (t.buyerId !== me.id) return res.status(403).json({ error: 'not_buyer' });
    if (t.status !== 'open') return res.status(409).json({ error: 'tender_closed' });
    const offer = await prisma.tenderOffer.findFirst({ where: { id: req.params.offerId, tenderId: t.id, status: 'sent' } });
    if (!offer) return res.status(404).json({ error: 'offer_not_found' });
    const others = await prisma.tenderOffer.findMany({ where: { tenderId: t.id, status: 'sent', id: { not: offer.id } }, select: { sellerUserId: true } });
    await prisma.$transaction([
      prisma.tenderOffer.update({ where: { id: offer.id }, data: { status: 'accepted' } }),
      prisma.tenderOffer.updateMany({ where: { tenderId: t.id, status: 'sent', id: { not: offer.id } }, data: { status: 'declined' } }),
      prisma.tender.update({ where: { id: t.id }, data: { status: 'awarded', awardedOfferId: offer.id } }),
    ]);
    const buyer = (await partyInfo([me.id])).get(me.id);
    await notify(offer.sellerUserId, {
      kind: 'tender_awarded',
      title: `Teklifiniz seçildi: ${t.title}`,
      body: `${buyer?.name ?? 'Alıcı'} teklifinizi kabul etti. Sohbetten devam edebilirsiniz.`,
      data: { tenderId: t.id, userId: me.id },
    });
    if (others.length) {
      await notifyMany(others.map((o) => o.sellerUserId), { kind: 'tender_closed', title: `Talep kapandı: ${t.title}`, body: 'Alıcı başka bir teklifi seçti.', data: { tenderId: t.id } });
    }
    res.json({ ok: true });
  })
);

// Alıcı talebi seçim yapmadan kapatır.
tendersRouter.post(
  '/:id/close',
  handle(async (req, res) => {
    const me = req.user!;
    const t = await loadTender(req);
    if (!t) return res.status(404).json({ error: 'tender_not_found' });
    if (t.buyerId !== me.id) return res.status(403).json({ error: 'not_buyer' });
    if (t.status !== 'open') return res.status(409).json({ error: 'tender_closed' });
    await prisma.tender.update({ where: { id: t.id }, data: { status: 'closed' } });
    const sellers = await prisma.tenderOffer.findMany({ where: { tenderId: t.id, status: 'sent' }, select: { sellerUserId: true } });
    if (sellers.length) {
      await notifyMany(sellers.map((s) => s.sellerUserId), { kind: 'tender_closed', title: `Talep kapandı: ${t.title}`, body: 'Alıcı talebi kapattı.', data: { tenderId: t.id } });
    }
    res.json({ ok: true });
  })
);
