import { z } from 'zod';
import { prisma } from './db';
import { fold } from './domain/glossary/normalize';
import { cityMatches } from './cities';
import { parseApparelQuery, type ApparelQuery } from './apparelQuery';
import { CERTIFICATES, OPERATIONS, PRODUCT_GROUPS, SERVICES, WORK_MODES, FABRIC_MODES, toProductionView } from './production';
import { t, type Lang } from './i18n';

// Konfeksiyon araması (docs/konfeksiyon-plani.md Bölüm B, madde 4-6).
// Süzgeçler iki kaynaktan gelir: serbest metin (q → parseApparelQuery) ve açık
// parametreler (mobil süzgeç sayfası, asistan aracı). Açık parametre metindekini ezer.
// Metinden çıkan bir süzgeci kullanıcı çipten silerse istemci `off` listesine o alanı
// yazar (ör. off=city); metin aynı kalır, o alan yok sayılır.

export const APPAREL_FILTER_FIELDS = ['group', 'kind', 'capacityMin', 'moqMax', 'leadMax', 'cert', 'service', 'city'] as const;
export type ApparelFilterField = (typeof APPAREL_FILTER_FIELDS)[number];

const keysOf = (list: readonly { key: string }[]) => list.map((o) => o.key) as [string, ...string[]];
// Hizmet süzgeci atölye işlemlerini de kapsar (kesim, dikim, overlok...).
export const APPAREL_SERVICE_OPTIONS = [...SERVICES, ...OPERATIONS.filter((o) => !SERVICES.some((s) => s.key === o.key))];

const optionalInt = z.coerce.number().int().min(0).max(100_000_000).optional();
export const apparelSearchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  kind: z.enum(['koleksiyon', 'atolye', 'hepsi']).optional(),
  group: z.enum(keysOf(PRODUCT_GROUPS)).optional(),
  capacityMin: optionalInt,
  moqMax: optionalInt,
  leadMax: z.coerce.number().int().min(0).max(365).optional(),
  cert: z.enum(keysOf(CERTIFICATES)).optional(),
  service: z.enum(keysOf(APPAREL_SERVICE_OPTIONS)).optional(),
  city: z.string().trim().max(60).optional(),
  // Virgüllü liste: "group,city"
  off: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (Array.isArray(v) ? v : v ? v.split(',') : []).filter((f): f is ApparelFilterField => (APPAREL_FILTER_FIELDS as readonly string[]).includes(f))),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).optional(),
});
export type ApparelSearchInput = z.input<typeof apparelSearchSchema>;

export interface ApparelFilters {
  group: string | null;
  kind: 'koleksiyon' | 'atolye' | null;
  capacityMin: number | null;
  moqMax: number | null;
  leadMax: number | null;
  cert: string | null;
  service: string | null;
  city: string | null;
}

// Metin + açık parametre + kapatılan alanlar → etkin süzgeç.
export function resolveFilters(input: z.output<typeof apparelSearchSchema>, parsed: ApparelQuery): ApparelFilters {
  const off = new Set(input.off ?? []);
  const pick = <K extends ApparelFilterField>(field: K, explicit: ApparelFilters[K] | undefined): ApparelFilters[K] | null => {
    if (explicit !== undefined && explicit !== null && explicit !== ('' as never)) return explicit;
    if (off.has(field)) return null;
    return (parsed[field] as ApparelFilters[K]) ?? null;
  };
  return {
    group: pick('group', input.group),
    kind: pick('kind', input.kind === 'hepsi' ? undefined : input.kind),
    capacityMin: pick('capacityMin', input.capacityMin),
    moqMax: pick('moqMax', input.moqMax),
    leadMax: pick('leadMax', input.leadMax),
    cert: pick('cert', input.cert),
    service: pick('service', input.service),
    city: pick('city', input.city || undefined),
  };
}

const labelOf = (list: readonly { key: string; label: string }[], key: string) => list.find((o) => o.key === key)?.label ?? key;
const fmt = (n: number) => n.toLocaleString('tr-TR');

export interface ApparelResult {
  company: { id: string; name: string; city: string; verification: string; logoUpdatedAt: Date | null; companyType: string };
  isOwn: boolean;
  mainGroups: { key: string; label: string }[];
  productGroups: { key: string; label: string }[];
  monthlyCapacity: number | null;
  moqPerModel: number | null;
  productionLeadDays: number | null;
  certificates: { key: string; label: string; documented: boolean }[];
  workMode: string;
  workModeLabel: string;
  fabricMode: string;
  fabricModeLabel: string;
  matchReasons: string[];
}

// Arama: önce Prisma ile kaba süzme (üretim kaydı olan konfeksiyon / fason atölye firmaları),
// sonra JSON dizi alanları (gruplar, sertifika, hizmet) JS'te süzülür. SQLite'ta JSON metin
// içinde güvenilir sorgu yok; bugünkü ölçekte (yüzlerce firma) bu yeterli. Firma sayısı
// binleri geçerse gruplar ayrı tabloya alınmalı.
export async function searchApparel(raw: ApparelSearchInput, viewerCompanyId: string | null, lang: Lang = 'tr') {
  const input = apparelSearchSchema.parse(raw);
  const parsed = parseApparelQuery(input.q ?? '');
  const filters = resolveFilters(input, parsed);
  const limit = input.limit ?? 20;
  const offset = input.offset ?? 0;

  const types = filters.kind === 'koleksiyon' ? ['konfeksiyon'] : ['konfeksiyon', 'fason_atolye'];
  const rows = await prisma.companyProduction.findMany({
    where: { company: { companyType: { in: types } } },
    include: { company: { select: { id: true, name: true, city: true, verification: true, logoUpdatedAt: true, companyType: true } } },
    take: 2000,
  });
  const docs = await prisma.companyPhoto.findMany({
    where: { companyId: { in: rows.map((r) => r.companyId) }, kind: 'certificate' },
    select: { companyId: true, position: true },
  });
  const docsOf = (companyId: string) => docs.filter((d) => d.companyId === companyId).map((d) => d.position);

  // Yapısal süzgeç yoksa kalan sözcükler firma adında / serbest grup metninde aranır.
  const anyFilter = Object.values(filters).some((v) => v != null);
  const nameWords = !anyFilter ? parsed.rest.filter((w) => w.length >= 3) : [];

  const scored: { r: ApparelResult; rank: number[] }[] = [];
  for (const row of rows) {
    const c = row.company;
    const p = toProductionView(row, docsOf(c.id));
    // Atölye: fason atölyeler + fason iş de alan konfeksiyonlar (çalışma şekli fason / ikisi).
    if (filters.kind === 'atolye' && !(c.companyType === 'fason_atolye' || p.workMode === 'fason' || p.workMode === 'ikisi')) continue;
    if (filters.city && !cityMatches(c.city, filters.city)) continue;
    const reasons: string[] = [];
    let groupRank = 2;
    if (filters.group) {
      if (p.mainGroups.includes(filters.group)) groupRank = 0;
      else if (p.productGroups.includes(filters.group)) groupRank = 1;
      else continue;
      reasons.push(t(lang, groupRank === 0 ? 'Ana uzmanlık: {g}' : 'Ürün grubu: {g}', { g: t(lang, labelOf(PRODUCT_GROUPS, filters.group)) }));
    }
    // Grup bazında kapasite girildiyse o sayı, yoksa toplam aylık kapasite.
    const capacity = (filters.group && p.capacityByGroup[filters.group]) || p.monthlyCapacity;
    if (filters.capacityMin != null) {
      if (capacity == null || capacity < filters.capacityMin) continue;
      reasons.push(t(lang, 'Aylık kapasite {n}', { n: fmt(capacity) }));
    }
    if (filters.moqMax != null) {
      if (p.moqPerModel == null || p.moqPerModel > filters.moqMax) continue;
      reasons.push(t(lang, 'MOQ {n}', { n: fmt(p.moqPerModel) }));
    }
    if (filters.leadMax != null) {
      if (p.productionLeadDays == null || p.productionLeadDays > filters.leadMax) continue;
      reasons.push(t(lang, 'Termin {n} gün', { n: p.productionLeadDays }));
    }
    if (filters.cert) {
      const cert = p.certificates.find((x) => x.key === filters.cert);
      if (!cert) continue;
      const label = t(lang, labelOf(CERTIFICATES, cert.key));
      reasons.push(cert.documented ? t(lang, '{c} belgeli', { c: label }) : label);
    }
    if (filters.service) {
      if (!p.services.includes(filters.service) && !p.operations.includes(filters.service)) continue;
      reasons.push(t(lang, labelOf(APPAREL_SERVICE_OPTIONS, filters.service)));
    }
    if (filters.city) reasons.push(c.city);
    if (nameWords.length) {
      const hay = fold(`${c.name} ${p.groupsOther}`);
      if (!nameWords.some((w) => hay.includes(w))) continue;
    }
    const result: ApparelResult = {
      company: c,
      isOwn: !!viewerCompanyId && c.id === viewerCompanyId,
      mainGroups: p.mainGroups.map((k) => ({ key: k, label: labelOf(PRODUCT_GROUPS, k) })),
      productGroups: p.productGroups.filter((k) => !p.mainGroups.includes(k)).map((k) => ({ key: k, label: labelOf(PRODUCT_GROUPS, k) })),
      monthlyCapacity: p.monthlyCapacity,
      moqPerModel: p.moqPerModel,
      productionLeadDays: p.productionLeadDays,
      certificates: p.certificates.map((x) => ({ key: x.key, label: labelOf(CERTIFICATES, x.key), documented: x.documented })),
      workMode: p.workMode,
      workModeLabel: p.workMode ? labelOf(WORK_MODES, p.workMode) : '',
      fabricMode: p.fabricMode,
      fabricModeLabel: p.fabricMode ? labelOf(FABRIC_MODES, p.fabricMode) : '',
      matchReasons: reasons,
    };
    // Sıra: ana uzmanlık > ürün grubunda > doğrulanmış > kapasite (büyükten küçüğe).
    scored.push({ r: result, rank: [groupRank, c.verification === 'dogrulanmis' ? 0 : 1, -(capacity ?? 0)] });
  }
  scored.sort((a, b) => {
    for (let i = 0; i < a.rank.length; i++) if (a.rank[i] !== b.rank[i]) return a.rank[i] - b.rank[i];
    return a.r.company.name.localeCompare(b.r.company.name, 'tr');
  });
  const page = scored.slice(offset, offset + limit).map((s) => s.r);
  return { results: page, total: scored.length, hasMore: offset + limit < scored.length, parsed, filters, off: input.off ?? [] };
}

// Süzgeç çipleri için etiket (mobil ve asistan özeti aynı metni kullanır).
export function filterLabels(f: ApparelFilters, lang: Lang = 'tr'): { field: ApparelFilterField; label: string }[] {
  const out: { field: ApparelFilterField; label: string }[] = [];
  if (f.group) out.push({ field: 'group', label: t(lang, labelOf(PRODUCT_GROUPS, f.group)) });
  if (f.kind) out.push({ field: 'kind', label: t(lang, f.kind === 'atolye' ? 'Fason atölye' : 'Koleksiyon') });
  if (f.capacityMin != null) out.push({ field: 'capacityMin', label: t(lang, 'Kapasite ≥ {n}/ay', { n: fmt(f.capacityMin) }) });
  if (f.moqMax != null) out.push({ field: 'moqMax', label: t(lang, 'MOQ ≤ {n}', { n: fmt(f.moqMax) }) });
  if (f.leadMax != null) out.push({ field: 'leadMax', label: t(lang, 'Termin ≤ {n} gün', { n: f.leadMax }) });
  if (f.cert) out.push({ field: 'cert', label: t(lang, labelOf(CERTIFICATES, f.cert)) });
  if (f.service) out.push({ field: 'service', label: t(lang, labelOf(APPAREL_SERVICE_OPTIONS, f.service)) });
  if (f.city) out.push({ field: 'city', label: f.city });
  return out;
}
