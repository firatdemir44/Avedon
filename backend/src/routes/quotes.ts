import { Router, type Request } from 'express';
import { z } from 'zod';
import { PRICE_CURRENCIES, STOCK_UNITS } from '../catalog';
import { prisma } from '../db';
import { effectiveWidthCm } from '../domain/calc/wastage';
import { requireAuth } from '../middleware/auth';
import { getConnectionState, isConnectedAccepted } from '../connections';
import { findOrCreateConversation } from '../conversations';
import { notify, notifyMany } from '../notifications';
import { computeQuoteDraft } from '../skills/calc/quoteDraft';
import { createDealFromAcceptedQuote } from './deals';
import { makeHandle } from './handle';

// Faz 2, Adım 2: teklif akışı. Alıcı istek açar (bağlantı şartı yok), satıcı
// firma taslak hazırlar (fiyat ürün kaydından gelir, UYDURULMAZ), gönderir;
// alıcı kabul/ret eder. Fiyat yalnızca iki tarafa görünür.
export const quotesRouter = Router();
quotesRouter.use(requireAuth);
const handle = makeHandle('quotes');

const REQUEST_INCLUDE = {
  product: { select: { id: true, code: true, type: true, subtype: true, weightGsm: true, widthCm: true, widthMeaning: true, companyId: true, company: { select: { id: true, name: true } } } },
  buyer: { select: { id: true, firstName: true, lastName: true, company: { select: { id: true, name: true } } } },
  quotes: { orderBy: { createdAt: 'desc' as const } },
} as const;

type RequestRow = Awaited<ReturnType<typeof loadRequest>>;

async function loadRequest(id: string) {
  return prisma.quoteRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE });
}

function roleOf(row: NonNullable<RequestRow>, user: NonNullable<Request['user']>): 'buyer' | 'seller' | null {
  if (row.buyerId === user.id) return 'buyer';
  if (user.companyId && user.companyId === row.sellerCompanyId) return 'seller';
  return null;
}

function toQuoteRow(q: NonNullable<RequestRow>['quotes'][number]) {
  const expired = q.status === 'sent' && q.validUntil != null && q.validUntil.getTime() < Date.now();
  return {
    id: q.id,
    status: expired ? 'expired' : q.status,
    price: q.priceValue == null ? null : { value: q.priceValue, currency: q.priceCurrency, unit: q.priceUnit },
    moq: q.moq,
    moqUnit: q.moqUnit,
    leadTimeDays: q.leadTimeDays,
    validUntil: q.validUntil,
    paymentTerms: q.paymentTerms,
    note: q.note,
    sentAt: q.sentAt,
    createdAt: q.createdAt,
  };
}

// Alıcı taslakları görmez; yalnızca gönderilmiş (ve sonrası) teklifleri görür.
function toRequestRow(row: NonNullable<RequestRow>, role: 'buyer' | 'seller') {
  const quotes = row.quotes.filter((q) => role === 'seller' || q.status !== 'draft').map(toQuoteRow);
  return {
    id: row.id,
    role,
    // Çoklu teklifin parçasıysa yalnızca ALICIYA döner (karşılaştırma tablosuna geçiş için).
    rfqId: role === 'buyer' ? row.rfqId : null,
    status: row.status,
    quantity: row.quantity,
    unit: row.unit,
    targetDate: row.targetDate,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    product: { id: row.product.id, code: row.product.code, type: row.product.type, subtype: row.product.subtype, weightGsm: row.product.weightGsm, widthCm: row.product.widthCm },
    sellerCompany: row.product.company,
    buyer: { id: row.buyer.id, name: `${row.buyer.firstName} ${row.buyer.lastName}`, company: row.buyer.company },
    quotes,
    activeQuote: quotes.find((q) => q.status === 'sent' || q.status === 'accepted') ?? null,
    draft: role === 'seller' ? (quotes.find((q) => q.status === 'draft') ?? null) : null,
  };
}

const unitEnum = z.enum(STOCK_UNITS);

const createSchema = z
  .object({
    productId: z.string().min(1),
    quantity: z.number().positive().max(10_000_000),
    unit: unitEnum,
    targetDate: z.coerce.date().nullable().optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

quotesRouter.post(
  '/requests',
  handle(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const me = req.user!;
    const product = await prisma.product.findUnique({
      where: { id: parsed.data.productId },
      select: { id: true, code: true, companyId: true, company: { select: { users: { select: { id: true } } } } },
    });
    if (!product) return res.status(404).json({ error: 'product_not_found' });
    if (me.companyId && me.companyId === product.companyId) return res.status(400).json({ error: 'own_product' });

    // Aynı ürüne açık bir isteği varken ikinciyi açmasın (yanlışlıkla çift dokunma).
    const open = await prisma.quoteRequest.findFirst({ where: { buyerId: me.id, productId: product.id, status: 'open' } });
    if (open) return res.status(409).json({ error: 'already_open', requestId: open.id });
    if ((await prisma.quoteRequest.count({ where: { buyerId: me.id, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })) >= 30) {
      return res.status(429).json({ error: 'daily_limit', max: 30, remaining: 0 });
    }

    const created = await prisma.quoteRequest.create({
      data: {
        buyerId: me.id,
        buyerCompanyId: me.companyId ?? null,
        sellerCompanyId: product.companyId,
        productId: product.id,
        quantity: parsed.data.quantity,
        unit: parsed.data.unit,
        targetDate: parsed.data.targetDate ?? null,
        note: parsed.data.note ?? '',
      },
      include: REQUEST_INCLUDE,
    });
    await notifyMany(
      product.company.users.map((u) => u.id),
      {
        kind: 'quote_request_new',
        title: 'Yeni teklif isteği: {code}',
        vars: { code: product.code },
        body: `${me.firstName} ${me.lastName} · ${parsed.data.quantity} ${parsed.data.unit}`,
        rawBody: true,
        data: { quoteRequestId: created.id, productId: product.id },
      }
    );
    res.status(201).json({ request: toRequestRow(created, 'buyer') });
  })
);

quotesRouter.get(
  '/requests',
  handle(async (req, res) => {
    const me = req.user!;
    const role = req.query.role === 'seller' ? 'seller' : 'buyer';
    if (role === 'seller' && !me.companyId) return res.json({ requests: [] });
    const rows = await prisma.quoteRequest.findMany({
      where: role === 'seller' ? { sellerCompanyId: me.companyId! } : { buyerId: me.id },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: REQUEST_INCLUDE,
    });
    res.json({ requests: rows.map((r) => toRequestRow(r, role)) });
  })
);

quotesRouter.get(
  '/requests/:id',
  handle(async (req, res) => {
    const row = await loadRequest(req.params.id);
    const role = row ? roleOf(row, req.user!) : null;
    if (!row || !role) return res.status(404).json({ error: 'request_not_found' });
    res.json({ request: toRequestRow(row, role) });
  })
);

// Satıcı: ürün kaydından taslak. Fiyat yoksa boş gelir ve "missing" ile bildirilir.
quotesRouter.post(
  '/requests/:id/draft',
  handle(async (req, res) => {
    const row = await loadRequest(req.params.id);
    if (!row || roleOf(row, req.user!) !== 'seller') return res.status(404).json({ error: 'request_not_found' });
    if (row.status !== 'open' && row.status !== 'quoted') return res.status(409).json({ error: 'request_closed' });

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: row.productId },
      select: { priceValue: true, priceCurrency: true, priceUnit: true, moq: true, moqUnit: true, leadTimeDays: true, weightGsm: true, widthCm: true, widthMeaning: true },
    });
    const unit = row.unit === 'kg' ? 'kg' : 'm';
    const draft = computeQuoteDraft({
      quantity: row.quantity,
      unit,
      priceValue: product.priceValue ?? undefined,
      priceCurrency: (PRICE_CURRENCIES as readonly string[]).includes(product.priceCurrency) ? (product.priceCurrency as 'TRY' | 'USD' | 'EUR') : undefined,
      priceUnit: product.priceUnit === 'm' || product.priceUnit === 'kg' ? product.priceUnit : undefined,
      weightGsm: product.weightGsm,
      widthCm: effectiveWidthCm(product.widthCm, product.widthMeaning === 'tup_tek_yuz' ? 'tup_tek_yuz' : 'acik'),
      moq: product.moq ?? undefined,
      moqUnit: product.moqUnit === 'm' || product.moqUnit === 'kg' ? product.moqUnit : undefined,
      leadTimeDays: product.leadTimeDays ?? undefined,
      validityDays: 15,
    });

    const data = {
      priceValue: draft.unitPrice != null ? Math.round(draft.unitPrice * 1000) / 1000 : null,
      priceCurrency: draft.currency ?? '',
      priceUnit: draft.unitPrice != null ? unit : '',
      moq: product.moq,
      moqUnit: product.moqUnit,
      leadTimeDays: product.leadTimeDays,
      validUntil: new Date(Date.now() + draft.validityDays * 24 * 60 * 60 * 1000),
    };
    const existing = row.quotes.find((q) => q.status === 'draft');
    if (existing) await prisma.quote.update({ where: { id: existing.id }, data });
    else await prisma.quote.create({ data: { ...data, requestId: row.id, sellerUserId: req.user!.id } });

    const fresh = await loadRequest(row.id);
    res.json({ request: toRequestRow(fresh!, 'seller'), draftInfo: { missing: draft.missing, belowMoq: draft.belowMoq, converted: draft.converted, total: draft.total } });
  })
);

const quoteSchema = z
  .object({
    priceValue: z.number().positive().nullable().optional(),
    priceCurrency: z.enum(PRICE_CURRENCIES).optional(),
    priceUnit: unitEnum.optional(),
    moq: z.number().positive().nullable().optional(),
    moqUnit: z.union([z.literal(''), unitEnum]).optional(),
    leadTimeDays: z.number().int().min(0).max(365).nullable().optional(),
    validUntil: z.coerce.date().nullable().optional(),
    paymentTerms: z.string().trim().max(300).optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

// Satıcı: taslağı elle yaz/düzelt (yoksa oluşturur).
quotesRouter.put(
  '/requests/:id/quote',
  handle(async (req, res) => {
    const parsed = quoteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const row = await loadRequest(req.params.id);
    if (!row || roleOf(row, req.user!) !== 'seller') return res.status(404).json({ error: 'request_not_found' });
    if (row.status !== 'open' && row.status !== 'quoted') return res.status(409).json({ error: 'request_closed' });
    const existing = row.quotes.find((q) => q.status === 'draft');
    if (existing) await prisma.quote.update({ where: { id: existing.id }, data: parsed.data });
    else await prisma.quote.create({ data: { ...parsed.data, requestId: row.id, sellerUserId: req.user!.id } });
    res.json({ request: toRequestRow((await loadRequest(row.id))!, 'seller') });
  })
);

// Satıcı: taslağı gönder. Fiyat, para birimi ve birim olmadan gönderilemez.
quotesRouter.post(
  '/requests/:id/quote/send',
  handle(async (req, res) => {
    const row = await loadRequest(req.params.id);
    if (!row || roleOf(row, req.user!) !== 'seller') return res.status(404).json({ error: 'request_not_found' });
    if (row.status !== 'open' && row.status !== 'quoted') return res.status(409).json({ error: 'request_closed' });
    const draft = row.quotes.find((q) => q.status === 'draft');
    if (!draft) return res.status(409).json({ error: 'no_draft' });
    if (draft.priceValue == null || !draft.priceCurrency || !draft.priceUnit) return res.status(400).json({ error: 'price_required' });

    await prisma.$transaction([
      prisma.quote.updateMany({ where: { requestId: row.id, status: 'sent' }, data: { status: 'superseded' } }),
      prisma.quote.update({ where: { id: draft.id }, data: { status: 'sent', sentAt: new Date() } }),
      prisma.quoteRequest.update({ where: { id: row.id }, data: { status: 'quoted' } }),
    ]);
    await notify(row.buyerId, {
      kind: 'quote_received',
      title: 'Teklif geldi: {code}',
      vars: { code: row.product.code },
      body: row.product.company.name,
      rawBody: true,
      data: { quoteRequestId: row.id, productId: row.productId },
    });
    await postQuoteToChat(req.user!.id, row.buyerId, row.id, row.product.code, draft).catch((err) => console.error('[quotes] sohbete düşürülemedi:', err));
    res.json({ request: toRequestRow((await loadRequest(row.id))!, 'seller') });
  })
);

// Teklif, iki kişi bağlantılıysa sohbete de kart olarak düşer (mesajlaşma bağlantı ister;
// bağlantı yoksa teklif yalnızca Tekliflerim + bildirimle gider). Fiyat yalnızca iki tarafın gördüğü sohbette.
async function postQuoteToChat(
  sellerUserId: string,
  buyerId: string,
  quoteRequestId: string,
  productCode: string,
  quote: { priceValue: number | null; priceCurrency: string; priceUnit: string; leadTimeDays: number | null }
) {
  if (sellerUserId === buyerId || !isConnectedAccepted(await getConnectionState(sellerUserId, buyerId))) return;
  const conversation = await findOrCreateConversation(sellerUserId, buyerId);
  const price = `${String(quote.priceValue).replace('.', ',')} ${quote.priceCurrency}/${quote.priceUnit}`;
  const body = `Teklif: ${productCode} · ${price}${quote.leadTimeDays != null ? ` · termin ${quote.leadTimeDays} gün` : ''}. Ayrıntılar Tekliflerim'de.`;
  const now = new Date();
  await prisma.$transaction([
    prisma.message.create({ data: { conversationId: conversation.id, senderId: sellerUserId, body, quoteRequestId, createdAt: now } }),
    prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: now } }),
  ]);
}

const respondSchema = z.object({ action: z.enum(['accept', 'decline']) }).strict();

// Alıcı: gönderilmiş teklifi kabul et / reddet.
quotesRouter.post(
  '/requests/:id/respond',
  handle(async (req, res) => {
    const parsed = respondSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
    const row = await loadRequest(req.params.id);
    if (!row || roleOf(row, req.user!) !== 'buyer') return res.status(404).json({ error: 'request_not_found' });
    const sent = row.quotes.find((q) => q.status === 'sent');
    if (row.status !== 'quoted' || !sent) return res.status(409).json({ error: 'no_active_quote' });
    if (sent.validUntil && sent.validUntil.getTime() < Date.now()) return res.status(409).json({ error: 'quote_expired' });

    const accepted = parsed.data.action === 'accept';
    await prisma.$transaction([
      prisma.quote.update({ where: { id: sent.id }, data: { status: accepted ? 'accepted' : 'declined' } }),
      prisma.quoteRequest.update({ where: { id: row.id }, data: { status: accepted ? 'accepted' : 'declined' } }),
    ]);
    // Faz 3 Adım 4: kabul edilen teklif sipariş kaydına döner (iki tarafın beyanıyla izlenir).
    const deal = accepted
      ? await createDealFromAcceptedQuote({
          quoteRequestId: row.id,
          quoteId: sent.id,
          buyerId: row.buyerId,
          buyerCompanyId: row.buyerCompanyId,
          sellerCompanyId: row.sellerCompanyId,
          productId: row.productId,
          productCode: row.product.code,
          quantity: row.quantity,
          unit: row.unit,
          leadTimeDays: sent.leadTimeDays,
          targetDate: row.targetDate,
        })
      : null;
    const sellers = await prisma.user.findMany({ where: { companyId: row.sellerCompanyId }, select: { id: true } });
    await notifyMany(
      sellers.map((u) => u.id),
      {
        kind: accepted ? 'quote_accepted' : 'quote_declined',
        title: accepted ? '{code}: teklif kabul edildi' : '{code}: teklif reddedildi',
        vars: { code: row.product.code },
        body: `${row.buyer.firstName} ${row.buyer.lastName}`,
        rawBody: true,
        data: { quoteRequestId: row.id, productId: row.productId, ...(deal ? { dealId: deal.id } : {}) },
      }
    );
    res.json({ request: toRequestRow((await loadRequest(row.id))!, 'buyer'), dealId: deal?.id ?? null });
  })
);

// Alıcı: isteği geri çek (teklif kabul edilmemişse).
quotesRouter.post(
  '/requests/:id/cancel',
  handle(async (req, res) => {
    const row = await loadRequest(req.params.id);
    if (!row || roleOf(row, req.user!) !== 'buyer') return res.status(404).json({ error: 'request_not_found' });
    if (row.status !== 'open' && row.status !== 'quoted') return res.status(409).json({ error: 'request_closed' });
    await prisma.quoteRequest.update({ where: { id: row.id }, data: { status: 'cancelled' } });
    res.json({ request: toRequestRow((await loadRequest(row.id))!, 'buyer') });
  })
);
