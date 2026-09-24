import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { fold } from '../domain/glossary';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { makeHandle } from './handle';
import { LlmNotConfiguredError, LlmOutputError, isLlmConfigured } from '../llm';
import { parseRange, rangeMatch } from '../machines/range';
import { KIND_GUESSES, extractMachineSheet, kindFromGuess, splitSheetDataUrl } from '../machines/importSheet';

// Faz 2, Adım 5: makine parkı (parkur) ve fason kapasite araması.
// Makine türü serbest metin (Fırat 2026-09-17); öneriler başlangıç listesi +
// platformda girilmiş türlerden gelir. Kapasite = parkur + firmanın beyan ettiği aylık tonaj.
export const machinesRouter = Router();
const handle = makeHandle('machines');

export const MACHINE_GROUPS = [
  { key: 'orme', label: 'Örme' },
  { key: 'dokuma', label: 'Dokuma' },
  { key: 'boya_terbiye', label: 'Boya - Terbiye' },
  { key: 'baski', label: 'Baskı' },
  { key: 'konfeksiyon', label: 'Konfeksiyon' },
  { key: 'iplik', label: 'İplik' },
  { key: 'diger', label: 'Diğer' },
] as const;
const GROUP_KEYS = MACHINE_GROUPS.map((g) => g.key) as [string, ...string[]];

// Başlangıç önerileri (bağlayıcı değil; üretici istediğini yazar).
const STARTER_KINDS: Record<string, string[]> = {
  orme: ['Yuvarlak örme (süprem)', 'Yuvarlak örme (ribana)', 'Yuvarlak örme (interlok)', 'Yuvarlak örme (jakar)', 'Üç iplik', 'Düz örme', 'Raschel', 'Çözgülü örme (trikot)', 'Yaka makinesi'],
  dokuma: ['Rapierli tezgâh', 'Hava jetli tezgâh', 'Su jetli tezgâh', 'Armürlü tezgâh', 'Jakarlı tezgâh', 'Çözgü hazırlama', 'Haşıl'],
  boya_terbiye: ['HT boya makinesi (overflow)', 'Jet boya', 'Jigger', 'Pad-batch', 'Ram', 'Sanfor', 'Şardon', 'Zımpara', 'Tüp açma', 'Kurutma', 'Kompaktör'],
  baski: ['Rotasyon baskı', 'Dijital baskı', 'Transfer baskı', 'Flat (düz) baskı'],
  konfeksiyon: ['Düz dikiş', 'Overlok', 'Reçme', 'Kesim (cutter)', 'Serim makinesi', 'Ütü - paket'],
  iplik: ['Ring', 'Open end', 'Vortex', 'Büküm', 'Tekstüre (DTY)', 'Bobin'],
  diger: [],
};

const MAX_MACHINES = 200;

const machineSchema = z
  .object({
    group: z.enum(GROUP_KEYS),
    kind: z.string().trim().min(2).max(80),
    brand: z.string().trim().max(60).optional(),
    model: z.string().trim().max(60).optional(),
    year: z.number().int().min(1950).max(2100).nullable().optional(),
    diameterInch: z.number().positive().max(100).nullable().optional(),
    gauge: z.number().positive().max(100).nullable().optional(),
    feeders: z.number().int().positive().max(500).nullable().optional(),
    needles: z.number().int().positive().max(20000).nullable().optional(),
    workingWidthCm: z.number().positive().max(1000).nullable().optional(),
    feature: z.string().trim().max(120).optional(),
    machineNo: z.number().int().min(0).max(99999).nullable().optional(),
    gaugeText: z.string().trim().max(40).optional(),
    needlesText: z.string().trim().max(40).optional(),
    fabricType: z.string().trim().max(80).optional(),
    count: z.number().int().min(1).max(999).optional(),
    dailyCapacityKg: z.number().positive().max(1000000).nullable().optional(),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

type MachineInput = z.infer<typeof machineSchema>;

// Aralık metinleri normalize edilir ("28 / 22" → "28-22"); sayısal alan ilk
// sayıdır (arama ve eski istemciler için). Geçersiz aralık null döner.
function normalizeRanges(data: MachineInput): MachineInput | null {
  const out = { ...data };
  if (data.gaugeText !== undefined) {
    const g = parseRange(data.gaugeText);
    if (!g) return null;
    out.gaugeText = g.text;
    if (g.first != null) out.gauge = g.first;
  } else if (data.gauge !== undefined) out.gaugeText = '';
  if (data.needlesText !== undefined) {
    const n = parseRange(data.needlesText);
    if (!n) return null;
    out.needlesText = n.text;
    if (n.first != null) out.needles = Math.round(n.first);
  } else if (data.needles !== undefined) out.needlesText = '';
  return out;
}

type MachineRow = Prisma.MachineGetPayload<Record<string, never>>;

function toMachineRow(m: MachineRow) {
  return {
    id: m.id,
    group: m.group,
    kind: m.kind,
    machineNo: m.machineNo,
    brand: m.brand,
    model: m.model,
    year: m.year,
    diameterInch: m.diameterInch,
    gauge: m.gauge,
    feeders: m.feeders,
    needles: m.needles,
    gaugeText: m.gaugeText,
    needlesText: m.needlesText,
    fabricType: m.fabricType,
    workingWidthCm: m.workingWidthCm,
    feature: m.feature,
    count: m.count,
    dailyCapacityKg: m.dailyCapacityKg,
    busyUntil: m.busyUntil,
    availabilityUpdatedAt: m.availabilityUpdatedAt,
    note: m.note,
  };
}

function toCapacity(c: { monthlyCapacityTons: number | null; capacityNote: string; contractOpen: boolean; capacityUpdatedAt: Date | null }) {
  return { monthlyCapacityTons: c.monthlyCapacityTons, note: c.capacityNote, contractOpen: c.contractOpen, updatedAt: c.capacityUpdatedAt };
}

const CAPACITY_SELECT = { monthlyCapacityTons: true, capacityNote: true, contractOpen: true, capacityUpdatedAt: true } as const;

// Gruplar ve tür önerileri: başlangıç listesi + platformda en çok girilenler.
machinesRouter.get(
  '/kinds',
  requireAuth,
  handle(async (req, res) => {
    const used = await prisma.machine.groupBy({ by: ['group', 'kind'], _count: { _all: true }, orderBy: { _count: { kind: 'desc' } }, take: 300 });
    const kinds: Record<string, string[]> = {};
    for (const g of MACHINE_GROUPS) {
      const seen = new Set<string>();
      const list: string[] = [];
      for (const k of [...STARTER_KINDS[g.key], ...used.filter((u) => u.group === g.key).map((u) => u.kind)]) {
        const key = fold(k);
        if (seen.has(key)) continue;
        seen.add(key);
        list.push(k);
      }
      kinds[g.key] = list.slice(0, 40);
    }
    res.json({ groups: MACHINE_GROUPS, kinds });
  })
);

// Bir firmanın parkuru (herkese açık: firma sayfasındaki "Makine parkı").
machinesRouter.get(
  '/company/:companyId',
  optionalAuth,
  handle(async (req, res) => {
    const company = await prisma.company.findUnique({ where: { id: req.params.companyId }, select: { id: true, ...CAPACITY_SELECT } });
    if (!company) return res.status(404).json({ error: 'company_not_found' });
    const machines = await prisma.machine.findMany({ where: { companyId: company.id }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
    res.json({ machines: machines.map(toMachineRow), capacity: toCapacity(company), totalCount: machines.reduce((s, m) => s + m.count, 0) });
  })
);

machinesRouter.post(
  '/',
  requireAuth,
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.status(403).json({ error: 'no_company' });
    const parsed = machineSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const data = normalizeRanges(parsed.data);
    if (!data) return res.status(400).json({ error: 'invalid_range' });
    const existing = await prisma.machine.count({ where: { companyId } });
    if (existing >= MAX_MACHINES) return res.status(409).json({ error: 'too_many_machines', max: MAX_MACHINES });
    const machine = await prisma.machine.create({ data: { ...data, companyId, kindKey: fold(data.kind), position: existing } });
    res.status(201).json({ machine: toMachineRow(machine) });
  })
);

machinesRouter.put(
  '/:id',
  requireAuth,
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.status(403).json({ error: 'no_company' });
    const parsed = machineSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const data = normalizeRanges(parsed.data);
    if (!data) return res.status(400).json({ error: 'invalid_range' });
    const own = await prisma.machine.findFirst({ where: { id: req.params.id, companyId } });
    if (!own) return res.status(404).json({ error: 'machine_not_found' });
    const machine = await prisma.machine.update({ where: { id: own.id }, data: { ...data, kindKey: fold(data.kind) } });
    res.json({ machine: toMachineRow(machine) });
  })
);

machinesRouter.delete(
  '/:id',
  requireAuth,
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.status(403).json({ error: 'no_company' });
    const own = await prisma.machine.findFirst({ where: { id: req.params.id, companyId } });
    if (!own) return res.status(404).json({ error: 'machine_not_found' });
    await prisma.machine.delete({ where: { id: own.id } });
    res.status(204).end();
  })
);

// Makine başına fason müsaitlik: sahibi tek dokunuşla "2 hafta dolu" vb. yazar.
// busyUntil null ya da geçmiş = müsait; görünen metin istemcide bugüne göre hesaplanır.
const availabilitySchema = z.object({ busyUntil: z.string().datetime({ offset: true }).nullable() }).strict();

machinesRouter.put(
  '/:id/availability',
  requireAuth,
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.status(403).json({ error: 'no_company' });
    const parsed = availabilitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const own = await prisma.machine.findFirst({ where: { id: req.params.id, companyId } });
    if (!own) return res.status(404).json({ error: 'machine_not_found' });
    const busyUntil = parsed.data.busyUntil ? new Date(parsed.data.busyUntil) : null;
    // En fazla 1 yıl ileri (yanlış tarih girişine karşı).
    if (busyUntil && busyUntil.getTime() > Date.now() + 366 * 24 * 3600 * 1000) return res.status(400).json({ error: 'busy_until_too_far' });
    const machine = await prisma.machine.update({ where: { id: own.id }, data: { busyUntil, availabilityUpdatedAt: new Date() } });
    res.json({ machine: toMachineRow(machine) });
  })
);

const capacitySchema = z
  .object({
    monthlyCapacityTons: z.number().positive().max(100000).nullable().optional(),
    note: z.string().trim().max(300).optional(),
    contractOpen: z.boolean().optional(),
  })
  .strict();

// Firmanın beyan ettiği aylık tonaj ve fason kapasite durumu.
machinesRouter.put(
  '/capacity/mine',
  requireAuth,
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.status(403).json({ error: 'no_company' });
    const parsed = capacitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const company = await prisma.company.update({
      where: { id: companyId },
      data: {
        ...(parsed.data.monthlyCapacityTons !== undefined ? { monthlyCapacityTons: parsed.data.monthlyCapacityTons } : {}),
        ...(parsed.data.note !== undefined ? { capacityNote: parsed.data.note } : {}),
        ...(parsed.data.contractOpen !== undefined ? { contractOpen: parsed.data.contractOpen } : {}),
        capacityUpdatedAt: new Date(),
      },
      select: CAPACITY_SELECT,
    });
    res.json({ capacity: toCapacity(company) });
  })
);

const searchSchema = z.object({
  group: z.enum(GROUP_KEYS).optional(),
  kind: z.string().trim().max(80).optional(),
  gauge: z.coerce.number().positive().optional(),
  diameterInch: z.coerce.number().positive().optional(),
  widthMin: z.coerce.number().positive().optional(),
  contractOpen: z.enum(['1', 'true']).optional(),
  city: z.string().trim().max(60).optional(),
  brand: z.string().trim().max(40).optional(),
  feeders: z.coerce.number().int().positive().optional(),
  // Yalnızca bugün boş (müsait) makineler.
  availableOnly: z.enum(['1', 'true']).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).max(5000).optional(),
});

export type MachineSearch = z.infer<typeof searchSchema>;

// Arama mantığı asistan aracıyla ortak (assistant/tools.ts kapasite_ara).
export async function searchCapacity(query: MachineSearch, excludeCompanyId?: string | null) {
  const machineWhere: Prisma.MachineWhereInput = {
    ...(query.group ? { group: query.group } : {}),
    ...(query.kind ? { kindKey: { contains: fold(query.kind) } } : {}),
    ...(query.diameterInch ? { diameterInch: query.diameterInch } : {}),
    ...(query.widthMin ? { workingWidthCm: { gte: query.widthMin } } : {}),
    // Fine aralıklı olabilir ("28-22" → 28 ve 22 aramasında da çıkar).
    ...(query.brand ? { brand: { contains: query.brand } } : {}),
    ...(query.feeders ? { feeders: query.feeders } : {}),
    AND: [
      ...(query.gauge ? [rangeMatch('gauge', 'gaugeText', query.gauge)] : []),
      ...(query.availableOnly ? [{ OR: [{ busyUntil: null }, { busyUntil: { lte: new Date() } }] }] : []),
    ],
  };
  const companies = await prisma.company.findMany({
    where: {
      machines: { some: machineWhere },
      ...(query.contractOpen ? { contractOpen: true } : {}),
      ...(query.city ? { city: { contains: query.city } } : {}),
      ...(excludeCompanyId ? { id: { not: excludeCompanyId } } : {}),
    },
    take: query.limit ?? 20,
    skip: query.offset ?? 0,
    orderBy: [{ contractOpen: 'desc' }, { capacityUpdatedAt: 'desc' }],
    select: { id: true, name: true, city: true, verification: true, logoUpdatedAt: true, ...CAPACITY_SELECT, machines: { where: machineWhere, orderBy: { position: 'asc' }, take: 8 } },
  });
  return companies.map((c) => ({
    company: { id: c.id, name: c.name, city: c.city, verification: c.verification, logoUpdatedAt: c.logoUpdatedAt },
    capacity: toCapacity(c),
    matchedMachines: c.machines.map(toMachineRow),
    matchedCount: c.machines.reduce((s, m) => s + m.count, 0),
  }));
}

machinesRouter.get(
  '/search',
  requireAuth,
  handle(async (req, res) => {
    const parsed = searchSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_query', details: parsed.error.flatten() });
    // Bir fazlasını isteyip "daha var mı" bilgisini üret (ayrı sayım sorgusu yok).
    const limit = parsed.data.limit ?? 20;
    const rows = await searchCapacity({ ...parsed.data, limit: Math.min(50, limit + 1) }, req.user!.companyId);
    const hasMore = rows.length > limit;
    res.json({ results: rows.slice(0, limit), hasMore, nextOffset: hasMore ? (parsed.data.offset ?? 0) + limit : null });
  })
);

// --- Toplu aktarım: makine parkı tablosunun fotoğrafı/PDF'i -------------------
// 1) extract: model satırları okur (kayıt yok). 2) commit: sahibin gözden
// geçirdiği satırlar tek seferde eklenir. Aynı Mak No'lu makine varsa istemci
// uyarır; skipDuplicates ile atlanır.
const MAX_SHEET_CHARS = 14_000_000; // ~10 MB base64
const MAX_EXTRACTS_PER_DAY = 20;
const extractCounts = new Map<string, { day: string; n: number }>();

const extractSchema = z.object({ file: z.string().max(MAX_SHEET_CHARS) }).strict();

machinesRouter.post(
  '/import/extract',
  requireAuth,
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.status(403).json({ error: 'no_company' });
    const parsed = extractSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const input = splitSheetDataUrl(parsed.data.file);
    if (!input) return res.status(400).json({ error: 'unsupported_file' });
    if (!isLlmConfigured()) return res.status(503).json({ error: 'llm_not_configured' });

    const day = new Date().toISOString().slice(0, 10);
    const used = extractCounts.get(req.user!.id);
    const n = used && used.day === day ? used.n : 0;
    if (n >= MAX_EXTRACTS_PER_DAY) return res.status(429).json({ error: 'daily_limit', max: MAX_EXTRACTS_PER_DAY });

    try {
      const { rows, recognized } = await extractMachineSheet(input);
      extractCounts.set(req.user!.id, { day, n: n + 1 });
      const existing = await prisma.machine.findMany({ where: { companyId, machineNo: { not: null } }, select: { machineNo: true } });
      res.json({ rows, recognized, existingMachineNos: [...new Set(existing.map((m) => m.machineNo!))].sort((a, b) => a - b) });
    } catch (err) {
      if (err instanceof LlmNotConfiguredError) return res.status(503).json({ error: 'llm_not_configured' });
      if (err instanceof LlmOutputError) return res.status(502).json({ error: 'extract_failed' });
      throw err;
    }
  })
);

const importRowSchema = z
  .object({
    machineNo: z.number().int().min(0).max(99999).nullable(),
    diameterInch: z.number().positive().max(100).nullable(),
    gaugeText: z.string().trim().max(40),
    brand: z.string().trim().max(60),
    needlesText: z.string().trim().max(40),
    feeders: z.number().int().positive().max(500).nullable(),
    fabricType: z.string().trim().max(80),
    kindGuess: z.enum(KIND_GUESSES),
  })
  .strict();

const commitSchema = z
  .object({ rows: z.array(importRowSchema).min(1).max(MAX_MACHINES), skipDuplicates: z.boolean().optional() })
  .strict();

machinesRouter.post(
  '/import/commit',
  requireAuth,
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.status(403).json({ error: 'no_company' });
    const parsed = commitSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

    const existing = await prisma.machine.findMany({ where: { companyId }, select: { machineNo: true } });
    const takenNos = new Set(existing.map((m) => m.machineNo).filter((n): n is number => n != null));
    let skipped = 0;
    const data: Prisma.MachineCreateManyInput[] = [];
    for (const [index, row] of parsed.data.rows.entries()) {
      if (parsed.data.skipDuplicates && row.machineNo != null && takenNos.has(row.machineNo)) {
        skipped++;
        continue;
      }
      const gauge = parseRange(row.gaugeText);
      const needles = parseRange(row.needlesText);
      if (!gauge || !needles) return res.status(400).json({ error: 'invalid_range', row: index });
      const { group, kind } = kindFromGuess(row.kindGuess, row.fabricType);
      data.push({
        companyId,
        group,
        kind,
        kindKey: fold(kind),
        machineNo: row.machineNo,
        brand: row.brand,
        diameterInch: row.diameterInch,
        gauge: gauge.first,
        gaugeText: gauge.text,
        needles: needles.first != null ? Math.round(needles.first) : null,
        needlesText: needles.text,
        feeders: row.feeders,
        fabricType: row.fabricType,
        count: 1,
        position: existing.length + data.length,
      });
      if (row.machineNo != null) takenNos.add(row.machineNo);
    }
    if (existing.length + data.length > MAX_MACHINES) {
      return res.status(409).json({ error: 'too_many_machines', max: MAX_MACHINES });
    }
    const created = data.length ? (await prisma.machine.createMany({ data })).count : 0;
    res.status(201).json({ created, skipped });
  })
);
