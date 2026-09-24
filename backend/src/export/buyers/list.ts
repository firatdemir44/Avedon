import { prisma } from '../../db';
import { countryByIso2 } from '../countries';
import { GROUP_RULES, hsGroup, industryByNaf, industryBySic, nafCodesFor, SEGMENT_LABEL, sicCodesFor, type Segment } from './segments';
import { localizeSize, scoreBuyer } from './score';
import { t, type Lang } from '../../i18n';
import { countryName } from '../countries';
import { ensureFresh, registrySources } from './sync';
import { SOURCE_LABEL, sourceUrl, type BuyerSource } from './types';

export const PAGE_SIZE = 20;

export const LEAD_STATUSES = ['yeni', 'inceleniyor', 'iletisim', 'numune', 'siparis', 'ilgisiz'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

const REGISTRY_NAME: Record<string, string> = { sirene: 'Fransa ticaret sicili', companies_house: 'BK şirketler sicili', wikidata: 'Wikidata' };

function parseRaw(raw: string): { employeesMin?: number | null; categorie?: string | null } {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function listBuyers(opts: { hs6: string; country: string; segment?: Segment; page: number; companyId: string | null; lang?: Lang }) {
  const lang = opts.lang ?? 'tr';
  const L = (text: string, vars?: Record<string, string | number>) => t(lang, text, vars);
  const segLabel = (k: string) => L(SEGMENT_LABEL[k as Segment] ?? SEGMENT_LABEL.diger);
  const group = hsGroup(opts.hs6);
  const { pending, errors } = await ensureFresh(opts.country, group);

  const naf = nafCodesFor(group);
  const sic = sicCodesFor(group);
  const rows = await prisma.buyerCompany.findMany({
    where: {
      countryIso2: opts.country,
      OR: [
        { source: 'sirene', industryCode: { in: naf } },
        { source: 'companies_house', industryCode: { in: sic } },
        { source: 'wikidata' },
      ],
    },
    take: 6000,
  });

  const scored = rows
    .map((r) => {
      const raw = parseRaw(r.raw);
      const s = scoreBuyer(
        { source: r.source, industryCode: r.industryCode, sizeLabel: r.sizeLabel, employeesMin: raw.employeesMin ?? null, categorie: raw.categorie ?? null, revenueEur: r.revenueEur, website: r.website, city: r.city, sourceUpdatedAt: r.sourceUpdatedAt },
        group,
        Date.now(),
        lang
      );
      return { r, s };
    })
    .filter((x) => x.s.parts[0].points > 0);

  // Aynı firma birden çok kaynaktaysa (ör. sicil + Wikidata) en yüksek puanlı kayıt kalır.
  const best = new Map<string, (typeof scored)[number]>();
  for (const x of scored) {
    const key = x.r.normalizedName || x.r.id;
    const prev = best.get(key);
    if (!prev || x.s.score > prev.s.score) best.set(key, x);
  }
  let list = [...best.values()].sort((a, b) => b.s.score - a.s.score || (b.r.revenueEur ?? 0) - (a.r.revenueEur ?? 0) || a.r.name.localeCompare(b.r.name));

  const segmentCounts: Record<string, number> = {};
  for (const x of list) segmentCounts[x.r.segment] = (segmentCounts[x.r.segment] ?? 0) + 1;
  if (opts.segment) list = list.filter((x) => x.r.segment === opts.segment);

  const total = list.length;
  const slice = list.slice((opts.page - 1) * PAGE_SIZE, opts.page * PAGE_SIZE);
  const leads = opts.companyId && slice.length
    ? await prisma.buyerLead.findMany({ where: { companyId: opts.companyId, buyerId: { in: slice.map((x) => x.r.id) } } })
    : [];

  const registry = registrySources(opts.country);
  const sources = [...registry, 'wikidata'].map((s) => L(REGISTRY_NAME[s]));
  const c = countryByIso2(opts.country);
  const cName = c ? countryName(c, lang) : opts.country;
  let note: string;
  if (registry.length) note = L('{country} için {sources} kullanılıyor. Liste herkese açık kayıtlardan üretilir; firmanın bu ürünü aldığı kesin değildir, puan olasılığı gösterir.', { country: cName, sources: sources.join(L(' ve ')) });
  else if (opts.country === 'GB') note = L("BK şirketler sicili anahtarı henüz tanımlı değil; şimdilik yalnızca Wikidata'daki bilinen moda/tekstil markaları gösteriliyor.");
  else note = L("{country} için ücretsiz açık ticaret sicili yok; şimdilik yalnızca Wikidata'daki bilinen moda/tekstil markaları gösteriliyor.", { country: cName });
  if (errors.length) note += ' ' + L('Bazı kaynaklara şu an ulaşılamadı; biraz sonra yeniden deneyin.');

  return {
    hs6: opts.hs6,
    group,
    groupLabel: L(GROUP_RULES[group].label),
    buyers: slice.map(({ r, s }) => {
      const lead = leads.find((l) => l.buyerId === r.id);
      const ind = r.source === 'sirene' ? industryByNaf(r.industryCode) : r.source === 'companies_house' ? industryBySic(r.industryCode) : null;
      return {
        id: r.id,
        name: r.name,
        city: r.city,
        countryIso2: r.countryIso2,
        website: r.website || null,
        segment: r.segment,
        segmentLabel: segLabel(r.segment),
        industryLabel: ind ? L(ind.label) : null,
        sizeLabel: localizeSize(r.sizeLabel, lang) || null,
        foundedYear: r.foundedYear,
        score: s.score,
        scoreParts: s.parts,
        reasons: s.reasons,
        source: r.source,
        sourceLabel: SOURCE_LABEL[r.source as BuyerSource] ? L(SOURCE_LABEL[r.source as BuyerSource]) : r.source,
        sourceUrl: sourceUrl(r.source, r.sourceId),
        lead: lead ? { status: lead.status, note: lead.note } : null,
      };
    }),
    total,
    page: opts.page,
    pageSize: PAGE_SIZE,
    segments: Object.entries(segmentCounts).map(([key, count]) => ({ key, label: SEGMENT_LABEL[key as Segment] ? L(SEGMENT_LABEL[key as Segment]) : key, count })),
    pending,
    coverage: { registry: registry.length > 0, sources },
    note,
    access: 'pilot' as const,
  };
}

export async function listLeads(companyId: string, lang: Lang = 'tr') {
  const leads = await prisma.buyerLead.findMany({ where: { companyId }, include: { buyer: true }, orderBy: { updatedAt: 'desc' }, take: 500 });
  return leads.map((l) => ({
    id: l.id,
    status: l.status,
    note: l.note,
    updatedAt: l.updatedAt,
    buyer: {
      id: l.buyer.id,
      name: l.buyer.name,
      city: l.buyer.city,
      countryIso2: l.buyer.countryIso2,
      countryName: (() => {
        const c = countryByIso2(l.buyer.countryIso2);
        return c ? countryName(c, lang) : l.buyer.countryIso2;
      })(),
      website: l.buyer.website || null,
      segmentLabel: t(lang, SEGMENT_LABEL[l.buyer.segment as Segment] ?? SEGMENT_LABEL.diger),
      sizeLabel: localizeSize(l.buyer.sizeLabel, lang) || null,
      sourceLabel: SOURCE_LABEL[l.buyer.source as BuyerSource] ? t(lang, SOURCE_LABEL[l.buyer.source as BuyerSource]) : l.buyer.source,
      sourceUrl: sourceUrl(l.buyer.source, l.buyer.sourceId),
    },
  }));
}
