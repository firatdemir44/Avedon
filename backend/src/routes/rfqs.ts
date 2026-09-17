import { Router } from 'express';
import { z } from 'zod';
import { STOCK_UNITS } from '../catalog';
import { prisma } from '../db';
import { effectiveWidthCm } from '../domain/calc/wastage';
import { requireAuth } from '../middleware/auth';
import { notifyMany } from '../notifications';
import { makeHandle } from './handle';

// Faz 3, Adım 1: çoklu teklif isteme ve karşılaştırma. Kime gideceğini ALICI seçer
// (işaretlediği ürünler); aynı ihtiyaçta bir firmaya tek istek gider. Satıcılar
// birbirini ve kaç firmaya sorulduğunu görmez (rfqId satıcıya dönmez).
export const rfqsRouter = Router();
rfqsRouter.use(requireAuth);
const handle = makeHandle('rfqs');

// Fırat 2026-09-18: 5 az; kullanımda ayarlanacak tek sabitler.
export const MAX_RFQ_COMPANIES = 10;
export const MAX_QUOTE_REQUESTS_PER_DAY = 30;

export async function quoteRequestsToday(buyerId: string) {
  return prisma.quoteRequest.count({ where: { buyerId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
}

const createSchema = z
  .object({
    productIds: z.array(z.string().min(1)).min(2).max(40),
    title: z.string().trim().max(80).optional(),
    quantity: z.number().positive().max(10_000_000),
    unit: z.enum(STOCK_UNITS),
    targetDate: z.coerce.date().nullable().optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

rfqsRouter.post(
  '/',
  handle(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const me = req.user!;
    const d = parsed.data;
    const ids = [...new Set(d.productIds)];
    const products = await prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, companyId: true, company: { select: { name: true, users: { select: { id: true } } } } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    // Seçim sırası korunur; firma başına ilk ürün alınır.
    const skipped: { productId: string; reason: 'not_found' | 'own_product' | 'same_company' | 'already_open' }[] = [];
    const chosen: typeof products = [];
    const companies = new Set<string>();
    const open = new Set(
      (await prisma.quoteRequest.findMany({ where: { buyerId: me.id, productId: { in: ids }, status: 'open' }, select: { productId: true } })).map((r) => r.productId)
    );
    for (const id of ids) {
      const p = byId.get(id);
      if (!p) skipped.push({ productId: id, reason: 'not_found' });
      else if (me.companyId && p.companyId === me.companyId) skipped.push({ productId: id, reason: 'own_product' });
      else if (companies.has(p.companyId)) skipped.push({ productId: id, reason: 'same_company' });
      else if (open.has(id)) skipped.push({ productId: id, reason: 'already_open' });
      else {
        companies.add(p.companyId);
        chosen.push(p);
      }
    }
    if (chosen.length > MAX_RFQ_COMPANIES) return res.status(400).json({ error: 'too_many_companies', max: MAX_RFQ_COMPANIES, selected: chosen.length });
    if (chosen.length < 2) return res.status(400).json({ error: 'need_two_companies', skipped });
    const today = await quoteRequestsToday(me.id);
    if (today + chosen.length > MAX_QUOTE_REQUESTS_PER_DAY) {
      return res.status(429).json({ error: 'daily_limit', max: MAX_QUOTE_REQUESTS_PER_DAY, remaining: Math.max(0, MAX_QUOTE_REQUESTS_PER_DAY - today) });
    }

    const title = d.title || `${chosen.map((p) => p.code).slice(0, 3).join(', ')}${chosen.length > 3 ? ` +${chosen.length - 3}` : ''}`;
    const rfq = await prisma.$transaction(async (tx) => {
      const created = await tx.rfq.create({
        data: { buyerId: me.id, title, quantity: d.quantity, unit: d.unit, targetDate: d.targetDate ?? null, note: d.note ?? '' },
      });
      for (const p of chosen) {
        await tx.quoteRequest.create({
          data: {
            rfqId: created.id,
            buyerId: me.id,
            buyerCompanyId: me.companyId ?? null,
            sellerCompanyId: p.companyId,
            productId: p.id,
            quantity: d.quantity,
            unit: d.unit,
            targetDate: d.targetDate ?? null,
            note: d.note ?? '',
          },
        });
      }
      return created;
    });

    const requests = await prisma.quoteRequest.findMany({ where: { rfqId: rfq.id }, select: { id: true, productId: true } });
    for (const p of chosen) {
      const requestId = requests.find((r) => r.productId === p.id)?.id;
      // Bildirim tekil istekle AYNI: satıcı bunun çoklu istek olduğunu anlamaz.
      await notifyMany(
        p.company.users.map((u) => u.id),
        { kind: 'quote_request_new', title: `Yeni teklif isteği: ${p.code}`, body: `${me.firstName} ${me.lastName} · ${d.quantity} ${d.unit}`, data: { quoteRequestId: requestId, productId: p.id } }
      );
    }
    res.status(201).json({ rfq: await compareView(rfq.id, me.id), skipped });
  })
);

rfqsRouter.get(
  '/',
  handle(async (req, res) => {
    const rows = await prisma.rfq.findMany({ where: { buyerId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 50 });
    const requests = await prisma.quoteRequest.findMany({
      where: { rfqId: { in: rows.map((r) => r.id) } },
      select: { rfqId: true, status: true },
    });
    res.json({
      rfqs: rows.map((r) => {
        const mine = requests.filter((q) => q.rfqId === r.id);
        return {
          id: r.id,
          title: r.title,
          quantity: r.quantity,
          unit: r.unit,
          targetDate: r.targetDate,
          createdAt: r.createdAt,
          requestCount: mine.length,
          quotedCount: mine.filter((q) => q.status === 'quoted' || q.status === 'accepted').length,
          acceptedCount: mine.filter((q) => q.status === 'accepted').length,
        };
      }),
    });
  })
);

rfqsRouter.get(
  '/:id',
  handle(async (req, res) => {
    const view = await compareView(req.params.id, req.user!.id);
    if (!view) return res.status(404).json({ error: 'rfq_not_found' });
    res.json({ rfq: view });
  })
);

// Birim fiyatı isteğin birimine çevirir (kg ↔ m): gramaj × hesap eni ürün kaydından.
// Çevrilemiyorsa (iplik, gramaj/en yok) null: tablo "çevrilemedi" der, uydurmaz.
function convertPrice(value: number, from: string, to: string, gsm: number, widthCm: number): number | null {
  if (from === to) return value;
  const kgPerMeter = (gsm * (widthCm / 100)) / 1000;
  if (!(kgPerMeter > 0)) return null;
  if (from === 'kg' && to === 'm') return value * kgPerMeter;
  if (from === 'm' && to === 'kg') return value / kgPerMeter;
  return null;
}

async function compareView(rfqId: string, buyerId: string) {
  const rfq = await prisma.rfq.findFirst({ where: { id: rfqId, buyerId } });
  if (!rfq) return null;
  const requests = await prisma.quoteRequest.findMany({
    where: { rfqId: rfq.id, buyerId },
    orderBy: { createdAt: 'asc' },
    include: {
      product: {
        select: { id: true, code: true, type: true, subtype: true, weightGsm: true, widthCm: true, widthMeaning: true, content: true, company: { select: { id: true, name: true, city: true, verification: true, verificationLevel: true, logoUpdatedAt: true } } },
      },
      // Alıcı taslakları görmez.
      quotes: { where: { status: { in: ['sent', 'accepted', 'declined'] } }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  const companyIds = requests.map((r) => r.product.company.id);
  const refs = await prisma.companyReference.findMany({
    where: { status: 'confirmed', OR: [{ fromCompanyId: { in: companyIds } }, { toCompanyId: { in: companyIds } }] },
    select: { fromCompanyId: true, toCompanyId: true },
  });
  const refCount = (id: string) => refs.filter((r) => r.fromCompanyId === id || r.toCompanyId === id).length;

  const rows = requests.map((r) => {
    const q = r.quotes[0] ?? null;
    const expired = !!q && q.status === 'sent' && q.validUntil != null && q.validUntil.getTime() < Date.now();
    const width = effectiveWidthCm(r.product.widthCm, r.product.widthMeaning === 'tup_tek_yuz' ? 'tup_tek_yuz' : 'acik');
    const comparable = q && q.priceValue != null && !expired && q.status !== 'declined' ? convertPrice(q.priceValue, q.priceUnit, rfq.unit, r.product.weightGsm, width) : null;
    return {
      requestId: r.id,
      requestStatus: r.status,
      product: { id: r.product.id, code: r.product.code, type: r.product.type, subtype: r.product.subtype, weightGsm: r.product.weightGsm, widthCm: r.product.widthCm, content: r.product.content },
      company: { ...r.product.company, confirmedReferenceCount: refCount(r.product.company.id) },
      quote: q
        ? {
            id: q.id,
            status: expired ? 'expired' : q.status,
            price: q.priceValue == null ? null : { value: q.priceValue, currency: q.priceCurrency, unit: q.priceUnit },
            // İsteğin birimine çevrilmiş birim fiyat (para birimi aynı kalır; kur çevrilmez).
            comparablePrice: comparable == null ? null : { value: Math.round(comparable * 10000) / 10000, currency: q.priceCurrency, unit: rfq.unit, converted: q.priceUnit !== rfq.unit },
            estimatedTotal: comparable == null ? null : { value: Math.round(comparable * rfq.quantity * 100) / 100, currency: q.priceCurrency },
            moq: q.moq,
            moqUnit: q.moqUnit,
            moqAboveQuantity: q.moq != null && q.moqUnit === rfq.unit && q.moq > rfq.quantity,
            leadTimeDays: q.leadTimeDays,
            validUntil: q.validUntil,
            paymentTerms: q.paymentTerms,
            note: q.note,
            sentAt: q.sentAt,
          }
        : null,
      flags: [] as string[],
    };
  });

  // En iyi işaretleri: fiyat yalnızca AYNI para birimi içinde karşılaştırılır.
  const live = rows.filter((r) => r.quote?.comparablePrice);
  for (const currency of new Set(live.map((r) => r.quote!.comparablePrice!.currency))) {
    const group = live.filter((r) => r.quote!.comparablePrice!.currency === currency);
    if (group.length < 2) continue;
    const min = Math.min(...group.map((r) => r.quote!.comparablePrice!.value));
    group.filter((r) => r.quote!.comparablePrice!.value === min).forEach((r) => r.flags.push('lowest_price'));
  }
  const withLead = rows.filter((r) => r.quote && r.quote.status !== 'declined' && r.quote.status !== 'expired' && r.quote.leadTimeDays != null);
  if (withLead.length >= 2) {
    const min = Math.min(...withLead.map((r) => r.quote!.leadTimeDays!));
    withLead.filter((r) => r.quote!.leadTimeDays === min).forEach((r) => r.flags.push('fastest'));
  }

  return {
    id: rfq.id,
    title: rfq.title,
    quantity: rfq.quantity,
    unit: rfq.unit,
    targetDate: rfq.targetDate,
    note: rfq.note,
    createdAt: rfq.createdAt,
    requestCount: rows.length,
    quotedCount: rows.filter((r) => r.quote).length,
    currencies: [...new Set(live.map((r) => r.quote!.comparablePrice!.currency))],
    rows,
  };
}
