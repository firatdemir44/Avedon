import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { fold } from '../domain/glossary';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { makeHandle } from './handle';

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
    count: z.number().int().min(1).max(999).optional(),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

type MachineRow = Prisma.MachineGetPayload<Record<string, never>>;

function toMachineRow(m: MachineRow) {
  return {
    id: m.id,
    group: m.group,
    kind: m.kind,
    brand: m.brand,
    model: m.model,
    year: m.year,
    diameterInch: m.diameterInch,
    gauge: m.gauge,
    feeders: m.feeders,
    needles: m.needles,
    workingWidthCm: m.workingWidthCm,
    feature: m.feature,
    count: m.count,
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
    const existing = await prisma.machine.count({ where: { companyId } });
    if (existing >= MAX_MACHINES) return res.status(409).json({ error: 'too_many_machines', max: MAX_MACHINES });
    const machine = await prisma.machine.create({ data: { ...parsed.data, companyId, kindKey: fold(parsed.data.kind), position: existing } });
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
    const own = await prisma.machine.findFirst({ where: { id: req.params.id, companyId } });
    if (!own) return res.status(404).json({ error: 'machine_not_found' });
    const machine = await prisma.machine.update({ where: { id: own.id }, data: { ...parsed.data, kindKey: fold(parsed.data.kind) } });
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
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export type MachineSearch = z.infer<typeof searchSchema>;

// Arama mantığı asistan aracıyla ortak (assistant/tools.ts kapasite_ara).
export async function searchCapacity(query: MachineSearch, excludeCompanyId?: string | null) {
  const machineWhere: Prisma.MachineWhereInput = {
    ...(query.group ? { group: query.group } : {}),
    ...(query.kind ? { kindKey: { contains: fold(query.kind) } } : {}),
    ...(query.gauge ? { gauge: query.gauge } : {}),
    ...(query.diameterInch ? { diameterInch: query.diameterInch } : {}),
    ...(query.widthMin ? { workingWidthCm: { gte: query.widthMin } } : {}),
  };
  const companies = await prisma.company.findMany({
    where: {
      machines: { some: machineWhere },
      ...(query.contractOpen ? { contractOpen: true } : {}),
      ...(query.city ? { city: { contains: query.city } } : {}),
      ...(excludeCompanyId ? { id: { not: excludeCompanyId } } : {}),
    },
    take: query.limit ?? 20,
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
    res.json({ results: await searchCapacity(parsed.data, req.user!.companyId) });
  })
);
