import { prisma } from '../../db';
import { nafCodesFor, sicCodesFor, type HsGroup } from './segments';
import { fetchSirene } from './sources/sirene';
import { fetchWikidata } from './sources/wikidata';
import { companiesHouseKeySet, fetchCompaniesHouse } from './sources/companiesHouse';
import type { BuyerInput, BuyerSource } from './types';

// Eşitleme: (kaynak, ülke, anahtar) başına bir iş. 30 gün taze sayılır; hata olursa 1 saat
// yeniden denenmez (kaynağı yormamak için). İşler tek sırada, arka planda çalışır.
const STALE_MS = 30 * 86400_000;
const RETRY_AFTER_ERROR_MS = 3600_000;

export interface SyncJob {
  source: BuyerSource;
  country: string;
  key: string;
}
const jobId = (j: SyncJob) => `${j.source}|${j.country}|${j.key}`;

export const registrySources = (iso2: string): BuyerSource[] =>
  iso2 === 'FR' ? ['sirene'] : iso2 === 'GB' && companiesHouseKeySet() ? ['companies_house'] : [];

export function jobsFor(iso2: string, group: HsGroup): SyncJob[] {
  const jobs: SyncJob[] = [];
  if (iso2 === 'FR') for (const naf of nafCodesFor(group)) jobs.push({ source: 'sirene', country: 'FR', key: naf });
  if (iso2 === 'GB' && companiesHouseKeySet()) {
    const sics = sicCodesFor(group);
    if (sics.length) jobs.push({ source: 'companies_house', country: 'GB', key: sics.join(',') });
  }
  jobs.push({ source: 'wikidata', country: iso2, key: 'brands' });
  return jobs;
}

async function fetchJob(j: SyncJob): Promise<BuyerInput[]> {
  if (j.source === 'sirene') return fetchSirene(j.key);
  if (j.source === 'companies_house') return fetchCompaniesHouse(j.key.split(','));
  return fetchWikidata(j.country);
}

export async function saveBuyers(list: BuyerInput[]): Promise<number> {
  const now = new Date();
  for (let i = 0; i < list.length; i += 100) {
    await prisma.$transaction(
      list.slice(i, i + 100).map((b) => {
        const data = {
          name: b.name,
          normalizedName: b.normalizedName,
          countryIso2: b.countryIso2,
          city: b.city,
          postalCode: b.postalCode,
          website: b.website,
          industryCode: b.industryCode,
          segment: b.segment,
          sizeCode: b.sizeCode,
          sizeLabel: b.sizeLabel,
          revenueEur: b.revenueEur,
          foundedYear: b.foundedYear,
          sourceUpdatedAt: b.sourceUpdatedAt,
          fetchedAt: now,
          raw: JSON.stringify({ ...b.raw, employeesMin: b.employeesMin }),
        };
        return prisma.buyerCompany.upsert({
          where: { source_sourceId: { source: b.source, sourceId: b.sourceId } },
          create: { source: b.source, sourceId: b.sourceId, ...data },
          update: data,
        });
      })
    );
  }
  return list.length;
}

export async function runJob(j: SyncJob): Promise<number> {
  const sync = await prisma.buyerSync.create({ data: { source: j.source, countryIso2: j.country, key: j.key, status: 'running' } });
  try {
    const list = await fetchJob(j);
    // Aynı kayıt birden çok sayfada gelebilir: tekilleştir.
    const unique = [...new Map(list.map((b) => [b.sourceId, b])).values()];
    const count = await saveBuyers(unique);
    await prisma.buyerSync.update({ where: { id: sync.id }, data: { status: 'ok', count, finishedAt: new Date() } });
    return count;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.buyerSync.update({ where: { id: sync.id }, data: { status: 'error', error: msg.slice(0, 300), finishedAt: new Date() } });
    throw err;
  }
}

type JobState = 'fresh' | 'running' | 'error' | 'missing';
async function jobState(j: SyncJob): Promise<JobState> {
  if (queue.has(jobId(j)) || current === jobId(j)) return 'running';
  const last = await prisma.buyerSync.findFirst({
    where: { source: j.source, countryIso2: j.country, key: j.key, status: { in: ['ok', 'error'] } },
    orderBy: { startedAt: 'desc' },
  });
  if (!last) return 'missing';
  const age = Date.now() - (last.finishedAt ?? last.startedAt).getTime();
  if (last.status === 'error') return age < RETRY_AFTER_ERROR_MS ? 'error' : 'missing';
  return age < STALE_MS ? 'fresh' : 'missing';
}

const queue = new Map<string, SyncJob>();
let current: string | null = null;
let draining = false;
async function drain() {
  if (draining) return;
  draining = true;
  try {
    while (queue.size) {
      const [id, job] = queue.entries().next().value as [string, SyncJob];
      current = id;
      queue.delete(id);
      try {
        await runJob(job);
      } catch (err) {
        console.error('[buyers] eşitleme', id, err instanceof Error ? err.message : err);
      }
      current = null;
    }
  } finally {
    draining = false;
  }
}

export function enqueue(jobs: SyncJob[]) {
  for (const j of jobs) if (current !== jobId(j)) queue.set(jobId(j), j);
  void drain();
}

// Eksik/eski işleri kuyruğa alır; true = en az bir iş sürüyor/sırada (istemci yeniden sorsun).
export async function ensureFresh(iso2: string, group: HsGroup): Promise<{ pending: boolean; errors: string[] }> {
  const jobs = jobsFor(iso2, group);
  const missing: SyncJob[] = [];
  let running = false;
  const errors: string[] = [];
  for (const j of jobs) {
    const s = await jobState(j);
    if (s === 'missing') missing.push(j);
    else if (s === 'running') running = true;
    else if (s === 'error') errors.push(j.source);
  }
  if (missing.length && process.env.EXPORT_BUYERS_OFFLINE !== '1') {
    enqueue(missing);
    running = true;
  }
  return { pending: running, errors: [...new Set(errors)] };
}

export async function buyersHealth() {
  const counts = await prisma.buyerCompany.groupBy({ by: ['source'], _count: { _all: true } });
  const last = await prisma.buyerSync.findFirst({ where: { status: 'ok' }, orderBy: { finishedAt: 'desc' } });
  return {
    counts: Object.fromEntries(counts.map((c) => [c.source, c._count._all])),
    lastSyncAt: last?.finishedAt ?? null,
    companiesHouseKeySet: companiesHouseKeySet(),
    queued: queue.size + (current ? 1 : 0),
  };
}
