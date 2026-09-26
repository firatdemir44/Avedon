import { Router } from 'express';
import { prisma } from '../db';
import { makeHandle } from './handle';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { APPAREL_SERVICE_OPTIONS, apparelSearchSchema, filterLabels, searchApparel } from '../apparelSearch';
import { hasProductionTab, productionOptions } from '../production';
import {
  APPAREL_FABRIC_MODES,
  MAX_APPAREL_REQUESTS_PER_DAY,
  apparelSummaryLine,
  attachmentKind,
  checkApparelRequest,
  fabricModeLabel,
  productGroupLabel,
  statusLabel,
} from '../apparelRequests';
import { notify, notifyMany } from '../notifications';
import { findOrCreateConversation } from '../conversations';
import { normalizeLang } from '../i18n';

// Konfeksiyon araması ve konfeksiyona teklif isteği (docs/konfeksiyon-plani.md Bölüm B).
// /api/production altına bağlanır.
export const apparelRouter = Router();
const handle = makeHandle('apparel');

// GET /api/production/search?q=&kind=&group=&capacityMin=&moqMax=&leadMax=&cert=&service=&city=&off=&limit=&offset=
apparelRouter.get(
  '/search',
  optionalAuth,
  handle(async (req, res) => {
    const parsed = apparelSearchSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_query', details: parsed.error.flatten() });
    const lang = normalizeLang(req.lang);
    const out = await searchApparel(parsed.data, req.user?.companyId ?? null, lang);
    // Metinden çıkanlar ayrı işaretlenir: istemci çipten silince `off` ile kapatır.
    res.json({
      ...out,
      chips: filterLabels(out.filters, lang).map((c) => ({ ...c, fromText: isFromText(c.field, parsed.data, out.parsed) })),
    });
  })
);

// Alan açık parametreyle verilmediyse ve metinde varsa → metinden.
function isFromText(field: string, input: object, parsed: object) {
  const i = input as Record<string, unknown>;
  const p = parsed as Record<string, unknown>;
  const explicit = i[field];
  if (explicit !== undefined && explicit !== '' && !(field === 'kind' && explicit === 'hepsi')) return false;
  return p[field] != null;
}

// --- Teklif isteği ---

type RequestRow = NonNullable<Awaited<ReturnType<typeof loadRequest>>>;

async function loadRequest(id: string) {
  return prisma.apparelQuoteRequest.findUnique({ where: { id } });
}

function roleOf(row: { buyerId: string; targetCompanyId: string }, user: { id: string; companyId: string | null }) {
  if (row.buyerId === user.id) return 'buyer' as const;
  if (user.companyId && user.companyId === row.targetCompanyId) return 'seller' as const;
  return null;
}

// Satırlar tek sorguda zenginleştirilir (alıcı, hedef firma, kumaş, ek sayısı).
async function toRows(rows: RequestRow[]) {
  const userIds = [...new Set(rows.map((r) => r.buyerId))];
  const companyIds = [...new Set(rows.flatMap((r) => [r.targetCompanyId, r.buyerCompanyId].filter((x): x is string => !!x)))];
  const productIds = [...new Set(rows.map((r) => r.fabricProductId).filter((x): x is string => !!x))];
  const [users, companies, products, attachments] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, avatarUpdatedAt: true } }),
    prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true, city: true, verification: true, logoUpdatedAt: true } }),
    prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, code: true, type: true, content: true, company: { select: { id: true, name: true } } } }),
    prisma.apparelQuoteAttachment.findMany({ where: { requestId: { in: rows.map((r) => r.id) } }, select: { requestId: true, kind: true, position: true }, orderBy: { position: 'asc' } }),
  ]);
  const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
  const u = byId(users);
  const c = byId(companies);
  const p = byId(products);
  return rows.map((r) => {
    const buyer = u.get(r.buyerId);
    return {
      id: r.id,
      status: r.status,
      statusLabel: statusLabel(r.status),
      productGroup: r.productGroup,
      productGroupLabel: productGroupLabel(r.productGroup),
      quantity: r.quantity,
      targetDate: r.targetDate,
      fabricMode: r.fabricMode,
      fabricModeLabel: fabricModeLabel(r.fabricMode),
      fabricProduct: r.fabricProductId ? p.get(r.fabricProductId) ?? null : null,
      note: r.note,
      attachments: attachments.filter((a) => a.requestId === r.id).map((a) => ({ kind: a.kind, position: a.position })),
      buyer: {
        id: r.buyerId,
        name: buyer ? `${buyer.firstName} ${buyer.lastName}` : '',
        avatarUpdatedAt: buyer?.avatarUpdatedAt ?? null,
        company: r.buyerCompanyId ? c.get(r.buyerCompanyId) ?? null : null,
      },
      targetCompany: c.get(r.targetCompanyId) ?? { id: r.targetCompanyId, name: '', city: '', verification: 'dogrulanmamis', logoUpdatedAt: null },
      conversationId: r.conversationId,
      repliedAt: r.repliedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });
}

// Süzgeç sayfası ve teklif formu için seçenekler (etiketler dile göre).
apparelRouter.get(
  '/options',
  optionalAuth,
  handle(async (req, res) => {
    res.json({ ...productionOptions(req.lang), services: APPAREL_SERVICE_OPTIONS, apparelFabricModes: APPAREL_FABRIC_MODES });
  })
);

apparelRouter.post(
  '/requests',
  requireAuth,
  handle(async (req, res) => {
    const check = checkApparelRequest(req.body);
    if (!check.ok) return res.status(400).json({ error: check.error, details: check.details });
    const me = req.user!;
    const d = check.data;
    const target = await prisma.company.findUnique({ where: { id: d.targetCompanyId }, select: { id: true, name: true, companyType: true, users: { select: { id: true } } } });
    if (!target || !hasProductionTab(target.companyType)) return res.status(404).json({ error: 'company_not_found' });
    // Kendi firmasına teklif isteği anlamsız.
    if (me.companyId && me.companyId === target.id) return res.status(400).json({ error: 'own_company' });
    let fabricCode: string | null = null;
    if (d.fabricProductId) {
      // Alıcının görebildiği bir kumaş olmalı: stokta olan ya da kendi / hedef firmanın ürünü.
      const product = await prisma.product.findUnique({ where: { id: d.fabricProductId }, select: { id: true, code: true, stock: true, companyId: true } });
      const visible = product && (product.stock > 0 || product.companyId === me.companyId || product.companyId === target.id);
      if (!visible) return res.status(404).json({ error: 'fabric_product_not_found' });
      fabricCode = product.code;
    }
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if ((await prisma.apparelQuoteRequest.count({ where: { buyerId: me.id, createdAt: { gte: since } } })) >= MAX_APPAREL_REQUESTS_PER_DAY) {
      return res.status(429).json({ error: 'daily_limit', max: MAX_APPAREL_REQUESTS_PER_DAY });
    }
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.apparelQuoteRequest.create({
        data: {
          buyerId: me.id,
          buyerCompanyId: me.companyId ?? null,
          targetCompanyId: target.id,
          productGroup: d.productGroup,
          quantity: d.quantity,
          targetDate: d.targetDate,
          fabricMode: d.fabricMode,
          fabricProductId: d.fabricProductId,
          note: d.note,
        },
      });
      if (d.attachments.length) {
        await tx.apparelQuoteAttachment.createMany({
          data: d.attachments.map((dataUrl, position) => ({ requestId: row.id, kind: attachmentKind(dataUrl), dataUrl, position })),
        });
      }
      return row;
    });
    await notifyMany(
      target.users.map((u) => u.id).filter((id) => id !== me.id),
      {
        kind: 'apparel_request_new',
        title: 'Yeni üretim teklif isteği: {group}',
        vars: { group: productGroupLabel(d.productGroup) },
        translateVars: ['group'],
        body: [`${me.firstName} ${me.lastName}`, `${d.quantity.toLocaleString('tr-TR')} adet`, fabricCode].filter(Boolean).join(' · '),
        rawBody: true,
        data: { apparelRequestId: created.id, companyId: target.id },
      }
    );
    res.status(201).json({ request: (await toRows([created]))[0] });
  })
);

// side=outgoing: gönderdiklerim · side=incoming: firmama gelenler
apparelRouter.get(
  '/requests',
  requireAuth,
  handle(async (req, res) => {
    const me = req.user!;
    const side = req.query.side === 'incoming' ? 'incoming' : 'outgoing';
    if (side === 'incoming' && !me.companyId) return res.json({ requests: [] });
    const rows = await prisma.apparelQuoteRequest.findMany({
      where: side === 'incoming' ? { targetCompanyId: me.companyId! } : { buyerId: me.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ requests: await toRows(rows) });
  })
);

apparelRouter.get(
  '/requests/:id',
  requireAuth,
  handle(async (req, res) => {
    const row = await loadRequest(req.params.id);
    const role = row ? roleOf(row, req.user!) : null;
    if (!row || !role) return res.status(404).json({ error: 'request_not_found' });
    res.json({ request: (await toRows([row]))[0], role });
  })
);

apparelRouter.get(
  '/requests/:id/attachments/:position',
  requireAuth,
  handle(async (req, res) => {
    const row = await loadRequest(req.params.id);
    if (!row || !roleOf(row, req.user!)) return res.status(404).json({ error: 'request_not_found' });
    const att = await prisma.apparelQuoteAttachment.findFirst({ where: { requestId: row.id, position: Number(req.params.position) || 0 }, select: { kind: true, dataUrl: true } });
    if (!att) return res.status(404).json({ error: 'attachment_not_found' });
    res.json(att);
  })
);

// Hedef firma: "Yanıtla" → alıcıyla sohbet açılır, ilk mesaj talebin özeti; durum yanıtlandı.
// Bu sohbette yazışmak için bağlantı gerekmez (routes/conversations.ts, apparelChatAllowed).
apparelRouter.post(
  '/requests/:id/reply',
  requireAuth,
  handle(async (req, res) => {
    const me = req.user!;
    const row = await loadRequest(req.params.id);
    if (!row || roleOf(row, me) !== 'seller') return res.status(404).json({ error: 'request_not_found' });
    if (row.status === 'kapandi') return res.status(409).json({ error: 'request_closed' });
    const conversation = await findOrCreateConversation(me.id, row.buyerId);
    if (!row.conversationId) {
      const fabric = row.fabricProductId ? await prisma.product.findUnique({ where: { id: row.fabricProductId }, select: { code: true } }) : null;
      const now = new Date();
      await prisma.$transaction([
        prisma.message.create({ data: { conversationId: conversation.id, senderId: me.id, body: apparelSummaryLine({ ...row, fabricCode: fabric?.code }), createdAt: now } }),
        prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: now } }),
        prisma.apparelQuoteRequest.update({ where: { id: row.id }, data: { status: 'yanitlandi', conversationId: conversation.id, repliedById: me.id, repliedAt: now } }),
      ]);
      const company = await prisma.company.findUnique({ where: { id: row.targetCompanyId }, select: { name: true } });
      await notify(row.buyerId, {
        kind: 'apparel_request_replied',
        title: '{company} üretim teklif isteğinizi yanıtladı',
        vars: { company: company?.name ?? '' },
        data: { apparelRequestId: row.id, companyId: row.targetCompanyId },
      });
    }
    const buyer = await prisma.user.findUnique({ where: { id: row.buyerId }, select: { firstName: true, lastName: true, avatarUpdatedAt: true } });
    res.json({
      conversationId: conversation.id,
      title: buyer ? `${buyer.firstName} ${buyer.lastName}` : '',
      userId: row.buyerId,
      avatarUpdatedAt: buyer?.avatarUpdatedAt ?? null,
      request: (await toRows([(await loadRequest(row.id))!]))[0],
    });
  })
);

// Alıcı talebi kapatır (vazgeçti / anlaştı).
apparelRouter.post(
  '/requests/:id/close',
  requireAuth,
  handle(async (req, res) => {
    const row = await loadRequest(req.params.id);
    if (!row || roleOf(row, req.user!) !== 'buyer') return res.status(404).json({ error: 'request_not_found' });
    const updated = row.status === 'kapandi' ? row : await prisma.apparelQuoteRequest.update({ where: { id: row.id }, data: { status: 'kapandi' } });
    res.json({ request: (await toRows([updated]))[0] });
  })
);

// Sohbette yazışma izni: bu sohbet bir konfeksiyon teklif isteğinden açıldıysa bağlantı şartı aranmaz.
export async function apparelChatAllowed(conversationId: string): Promise<boolean> {
  return (await prisma.apparelQuoteRequest.count({ where: { conversationId, status: { not: 'kapandi' } } })) > 0;
}
