import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { makeHandle } from './handle';
import { COMMON_HS, suggestHs } from '../export/hs';
import { TARGET_COUNTRIES } from '../export/countries';
import { rankMarkets, rankMarketsProgressive } from '../export/trade';
import { insightFor, overview, referenceShare } from '../export/insight';
import { countryByIso2, localizeCountry } from '../export/countries';
import { t } from '../i18n';
import { LEAD_STATUSES, listBuyers, listLeads } from '../export/buyers/list';

// Dünyayı Keşfet / İhracat Radarı — A aşaması (docs/kesfet-ihracat-plani.md §7):
// ürün → HS6 önerisi, ülke listesi ve pazar puanı. Aday alıcı listesi B aşamasında.
// Platinum kısıtı ödeme altyapısıyla gelecek; şimdilik firması olan kullanıcılara açık.
export const exportRadarRouter = Router();
exportRadarRouter.use(requireAuth);
const handle = makeHandle('exportRadar');

exportRadarRouter.get(
  '/countries',
  handle(async (req, res) => {
    const lang = req.lang;
    res.json({
      countries: TARGET_COUNTRIES.map((c) => localizeCountry(c, lang)),
      commonHs: COMMON_HS.map((h) => ({ ...h, label: t(lang, h.label), group: t(lang, h.group) })),
    });
  })
);

// Firmanın ürünleri ve her biri için HS önerisi.
exportRadarRouter.get(
  '/products',
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.status(400).json({ error: 'no_company' });
    const rows = await prisma.product.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, code: true, type: true, subtype: true, weightGsm: true, finishTags: true, content: true,
        compositions: { select: { fiber: true, percent: true }, orderBy: { position: 'asc' } },
        yarnSpec: { select: { family: true, filamentType: true, spinning: true, combing: true, countUnit: true, count: true } },
      },
    });
    res.json({
      products: rows.map((p) => {
        let finishTags: string[] = [];
        try {
          finishTags = JSON.parse(p.finishTags || '[]');
        } catch {
          finishTags = [];
        }
        return {
          id: p.id,
          code: p.code,
          type: p.type,
          subtype: p.subtype,
          content: p.content,
          hs: suggestHs({ type: p.type, subtype: p.subtype, weightGsm: p.weightGsm, composition: p.compositions, finishTags, yarn: p.yarnSpec }, req.lang),
        };
      }),
    });
  })
);

const marketsSchema = z
  .object({
    hs6: z.string().regex(/^\d{6}$/),
    countries: z.string().regex(/^\d+(,\d+)*$/).optional(),
    region: z.enum(['AB', 'Avrupa', 'Kuzey Amerika', 'Latin Amerika', 'Orta Doğu', 'Afrika', 'Asya']).optional(),
    wait: z.enum(['0', '1']).optional(),
  })
  .strict();

// Seçilen ülkeler (ya da bölge, ya da hepsi) için pazar puanı. İlk çağrı Comtrade'den çeker
// (ülke başına ~2-4 sn), sonra 30 gün önbellekten gelir.
exportRadarRouter.get(
  '/markets',
  handle(async (req, res) => {
    const parsed = marketsSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_query' });
    const { hs6, countries, region } = parsed.data;
    let m49s = countries ? countries.split(',').map(Number) : TARGET_COUNTRIES.map((c) => c.m49);
    if (region) m49s = TARGET_COUNTRIES.filter((c) => c.region === region && m49s.includes(c.m49)).map((c) => c.m49);
    if (m49s.length > 40) return res.status(400).json({ error: 'too_many_countries' });
    // wait=1: tüm ülkeler hazır olana kadar bekler (asistan/testler); varsayılan: aşamalı.
    const { markets: raw, pending } = req.query.wait === '1' ? { markets: await rankMarkets(hs6, m49s), pending: [] as number[] } : await rankMarketsProgressive(hs6, m49s);
    // Yorum: sayılar karara çevrilir (pazar tipi, kazanılabilir pazar, fiyat konumu, hamle).
    const ref = referenceShare(raw);
    const lang = req.lang;
    const markets = raw.map((m) => ({ ...m, country: localizeCountry(m.country, lang), insight: insightFor(m, ref, lang) }));
    res.json({
      hs6,
      markets,
      pending,
      overview: overview(markets, lang),
      referenceSharePct: ref,
      source: t(lang, 'UN Comtrade (ithalat, USD, CIF)'),
      note: t(lang, 'Son yayımlanmış yıl; ülkeler veriyi 6-18 ay gecikmeyle bildirir. Yorumlar veriden kurallarla üretilir; yatırım tavsiyesi değildir.'),
    });
  })
);

// ---- B aşaması: aday alıcılar (docs/kesfet-ihracat-plani.md §2.3) ----
// Pilot: firması olan her kullanıcıya açık (access: 'pilot'); Platinum kısıtı ödemeyle gelecek.
const buyersSchema = z
  .object({
    hs6: z.string().regex(/^\d{6}$/),
    country: z.string().regex(/^[A-Z]{2}$/),
    segment: z.enum(['konfeksiyon', 'kumas_toptan', 'giyim_toptan', 'ev_tekstili', 'kumas_uretici', 'marka', 'diger']).optional(),
    page: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();

exportRadarRouter.get(
  '/buyers',
  handle(async (req, res) => {
    const parsed = buyersSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_query' });
    const c = countryByIso2(parsed.data.country);
    if (!c) return res.status(400).json({ error: 'unknown_country' });
    if (c.access === 'engelli') return res.status(400).json({ error: 'blocked_country' });
    res.json(await listBuyers({ ...parsed.data, page: parsed.data.page ?? 1, companyId: req.user!.companyId ?? null, lang: req.lang }));
  })
);

const leadSchema = z.object({ status: z.enum(LEAD_STATUSES), note: z.string().max(1000).optional() }).strict();

exportRadarRouter.post(
  '/buyers/:id/lead',
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.status(400).json({ error: 'no_company' });
    const parsed = leadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
    const buyer = await prisma.buyerCompany.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
    if (!buyer) return res.status(404).json({ error: 'not_found' });
    const note = parsed.data.note?.trim();
    const lead = await prisma.buyerLead.upsert({
      where: { companyId_buyerId: { companyId, buyerId: buyer.id } },
      create: { companyId, buyerId: buyer.id, status: parsed.data.status, note: note ?? '' },
      update: { status: parsed.data.status, ...(note !== undefined ? { note } : {}) },
    });
    res.json({ lead: { status: lead.status, note: lead.note } });
  })
);

exportRadarRouter.get(
  '/leads',
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.status(400).json({ error: 'no_company' });
    res.json({ leads: await listLeads(companyId, req.lang) });
  })
);
