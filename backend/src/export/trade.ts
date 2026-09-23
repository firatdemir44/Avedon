import { prisma } from '../db';
import { CHINA_M49, TARGET_COUNTRIES, TURKEY_M49, type TargetCountry } from './countries';

// Pazar verisi: UN Comtrade (ücretsiz "preview" ucu, anahtarsız; tek istekte bir yıl, 500 satır).
// Her (ithalatçı ülke, HS6, yıl) için partner kırılımı çekilir ve 30 gün TradeStat'ta saklanır.
// EXPORT_TRADE_MOCK=1: ağa çıkılmaz, sabit örnek veri döner (testler için).
const COMTRADE = 'https://comtradeapi.un.org/public/v1/preview/C/A/HS';
const CACHE_DAYS = 30;

export interface PartnerRow {
  partner: number;
  value: number; // USD (CIF ithalat)
  kg: number | null;
}
export interface YearStat {
  year: number;
  total: number;
  totalKg: number | null;
  partners: PartnerRow[]; // en büyük 25 tedarikçi ülke
}

function mockStat(reporter: number, hs6: string, year: number): YearStat | null {
  // Deterministik sahte veri: ülke kodu ve yıl üzerinden (testlerde aynı sonuç).
  const seed = (reporter * 31 + Number(hs6.slice(0, 4)) + year) % 97;
  const total = 20_000_000 + seed * 900_000 + (year - 2023) * 3_000_000;
  const tr = reporter === 276 ? total * 0.16 : total * ((seed % 20) / 100);
  return {
    year,
    total,
    totalKg: total / 9,
    partners: [
      { partner: 0, value: total, kg: total / 9 },
      { partner: TURKEY_M49, value: tr, kg: tr / 11 },
      { partner: CHINA_M49, value: total * 0.25, kg: (total * 0.25) / 7.5 },
      { partner: 380, value: total * 0.2, kg: (total * 0.2) / 25 },
    ],
  };
}

// Comtrade anahtarsız uçta eşzamanlı isteklere 429 verir: tüm istekler tek sırada, aralarında
// en az GAP_MS; 429 gelirse artan beklemeyle 4 kez yeniden denenir. COMTRADE_KEY tanımlıysa
// (ücretsiz abonelik anahtarı, günde 500 çağrı) resmi uç kullanılır ve aralık kısalır.
const GAP_MS = process.env.COMTRADE_KEY ? 400 : 1500;
let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = lastAt + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await fn();
    } finally {
      lastAt = Date.now();
    }
  });
  chain = run.catch(() => undefined);
  return run;
}

async function requestComtrade(url: string, headers: Record<string, string>) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await throttled(() => fetch(url, { headers, signal: AbortSignal.timeout(25_000) }));
    if (res.status !== 429) return res;
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error('comtrade_429');
}

async function fetchYear(reporter: number, hs6: string, year: number): Promise<YearStat | null> {
  if (process.env.EXPORT_TRADE_MOCK === '1') return mockStat(reporter, hs6, year);
  const key = process.env.COMTRADE_KEY?.trim();
  const base = key ? 'https://comtradeapi.un.org/data/v1/get/C/A/HS' : COMTRADE;
  const url = `${base}?reporterCode=${reporter}&period=${year}&cmdCode=${hs6}&flowCode=M&partner2Code=0&motCode=0&customsCode=C00`;
  const res = await requestComtrade(url, key ? { 'Ocp-Apim-Subscription-Key': key } : {});
  if (!res.ok) throw new Error(`comtrade_${res.status}`);
  const json = (await res.json()) as { data?: { partnerCode: number; primaryValue: number; netWgt: number | null }[]; error?: string };
  if (json.error) throw new Error(`comtrade_${json.error}`);
  const rows = json.data ?? [];
  const world = rows.find((r) => r.partnerCode === 0);
  if (!world || !world.primaryValue) return null;
  const partners = rows
    .map((r) => ({ partner: r.partnerCode, value: r.primaryValue, kg: r.netWgt && r.netWgt > 0 ? r.netWgt : null }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 26);
  return { year, total: world.primaryValue, totalKg: world.netWgt && world.netWgt > 0 ? world.netWgt : null, partners };
}

// Önbellekten ya da Comtrade'den bir yıl. Veri yoksa (henüz yayımlanmamış) null.
export async function getYear(reporter: number, hs6: string, year: number): Promise<YearStat | null> {
  const cached = await prisma.tradeStat.findUnique({ where: { reporter_hs6_year: { reporter, hs6, year } } });
  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_DAYS * 86400_000) {
    return cached.json ? (JSON.parse(cached.json) as YearStat) : null;
  }
  const stat = await fetchYear(reporter, hs6, year);
  await prisma.tradeStat.upsert({
    where: { reporter_hs6_year: { reporter, hs6, year } },
    create: { reporter, hs6, year, json: stat ? JSON.stringify(stat) : '', fetchedAt: new Date() },
    update: { json: stat ? JSON.stringify(stat) : '', fetchedAt: new Date() },
  });
  return stat;
}

// Son iki yayımlanmış yıl (ülkeler Comtrade'e 6-18 ay gecikmeyle bildirir).
export async function latestTwo(reporter: number, hs6: string): Promise<[YearStat | null, YearStat | null]> {
  const now = new Date().getFullYear();
  for (const y of [now - 1, now - 2, now - 3]) {
    const cur = await getYear(reporter, hs6, y);
    if (cur) return [cur, await getYear(reporter, hs6, y - 1)];
  }
  return [null, null];
}

const share = (s: YearStat | null, partner: number) => s?.partners.find((p) => p.partner === partner) ?? null;
const unit = (p: PartnerRow | null) => (p && p.kg ? p.value / p.kg : null);

export interface MarketRow {
  country: TargetCountry;
  year: number | null;
  importUsd: number | null;
  growthPct: number | null;
  turkeyUsd: number | null;
  turkeySharePct: number | null;
  turkeyRank: number | null;
  unitUsdKg: { turkey: number | null; world: number | null; china: number | null };
  topSuppliers: { m49: number; sharePct: number; usdKg: number | null }[];
  score: number | null;
  scoreParts: { label: string; points: number }[];
  blocked: boolean;
}

// Pazar puanı (0-100): büyüklük 35 + büyüme 20 + Türkiye için boşluk 20 + erişim 15 + kanıt 10.
// Kanıt: Türkiye zaten satıyorsa (pay > %1) alıcıların Türk tedarikçiye açık olduğu görülür.
export function scoreMarket(country: TargetCountry, cur: YearStat | null, prev: YearStat | null): MarketRow {
  const base: MarketRow = {
    country,
    year: cur?.year ?? null,
    importUsd: cur?.total ?? null,
    growthPct: null,
    turkeyUsd: null,
    turkeySharePct: null,
    turkeyRank: null,
    unitUsdKg: { turkey: null, world: null, china: null },
    topSuppliers: [],
    score: null,
    scoreParts: [],
    blocked: country.access === 'engelli',
  };
  if (base.blocked || !cur) return base;
  const tr = share(cur, TURKEY_M49);
  const ranked = cur.partners.filter((p) => p.partner !== 0);
  base.growthPct = prev && prev.total ? ((cur.total - prev.total) / prev.total) * 100 : null;
  base.turkeyUsd = tr?.value ?? 0;
  base.turkeySharePct = ((tr?.value ?? 0) / cur.total) * 100;
  const idx = ranked.findIndex((p) => p.partner === TURKEY_M49);
  base.turkeyRank = idx >= 0 ? idx + 1 : null;
  base.unitUsdKg = { turkey: unit(tr), world: cur.totalKg ? cur.total / cur.totalKg : null, china: unit(share(cur, CHINA_M49)) };
  base.topSuppliers = ranked.slice(0, 6).map((p) => ({ m49: p.partner, sharePct: (p.value / cur.total) * 100, usdKg: unit(p) }));

  // Büyüklük: 1 M$ → 0, 1 milyar $ → 35 (logaritmik).
  const size = Math.max(0, Math.min(35, ((Math.log10(Math.max(cur.total, 1)) - 6) / 3) * 35));
  // Büyüme: -%20 → 0, +%30 → 20.
  const growth = base.growthPct == null ? 8 : Math.max(0, Math.min(20, ((base.growthPct + 20) / 50) * 20));
  // Boşluk: Türkiye payı düştükçe artar ama %0 ise (belki engel var) tam puan verilmez.
  const trShare = base.turkeySharePct;
  const headroom = trShare >= 60 ? 2 : trShare === 0 ? 12 : 20 * (1 - trShare / 100);
  const access = country.access === 'gumruk_birligi' ? 15 : country.access === 'sta' ? 12 : 6;
  const proof = trShare >= 1 ? 10 : trShare > 0 ? 5 : 0;
  const riskPenalty = country.risk === 'odeme' || country.risk === 'kur' ? -5 : 0;
  base.scoreParts = [
    { label: 'Pazar büyüklüğü', points: Math.round(size) },
    { label: 'Büyüme', points: Math.round(growth) },
    { label: 'Türkiye için boşluk', points: Math.round(headroom) },
    { label: 'Erişim (anlaşma/vergi)', points: access },
    { label: 'Türk tedarikçiye açıklık', points: proof },
    ...(riskPenalty ? [{ label: 'Ödeme/kur riski', points: riskPenalty }] : []),
  ];
  base.score = Math.max(0, Math.min(100, Math.round(size + growth + headroom + access + proof + riskPenalty)));
  return base;
}

// Yalnızca önbellekten (ağa çıkmadan). undefined = önbellekte yok / süresi dolmuş.
async function cachedYear(reporter: number, hs6: string, year: number): Promise<YearStat | null | undefined> {
  const c = await prisma.tradeStat.findUnique({ where: { reporter_hs6_year: { reporter, hs6, year } } });
  if (!c || Date.now() - c.fetchedAt.getTime() >= CACHE_DAYS * 86400_000) return undefined;
  return c.json ? (JSON.parse(c.json) as YearStat) : null;
}
async function latestTwoCached(reporter: number, hs6: string): Promise<[YearStat | null, YearStat | null] | undefined> {
  const now = new Date().getFullYear();
  for (const y of [now - 1, now - 2, now - 3]) {
    const cur = await cachedYear(reporter, hs6, y);
    if (cur === undefined) return undefined;
    if (cur) {
      const prev = await cachedYear(reporter, hs6, y - 1);
      if (prev === undefined) return undefined;
      return [cur, prev];
    }
  }
  return [null, null];
}

// Arka plan kuyruğu: eksik (ülke, HS) çiftleri sırayla çekilir; aynı çift iki kez kuyruğa girmez.
const pending = new Set<string>();
let draining = false;
async function drain() {
  if (draining) return;
  draining = true;
  try {
    while (pending.size) {
      const key = pending.values().next().value as string;
      const [m49, hs6] = key.split(':');
      try {
        await latestTwo(Number(m49), hs6);
      } catch (err) {
        console.error('[export] arka plan', key, err instanceof Error ? err.message : err);
      }
      pending.delete(key);
    }
  } finally {
    draining = false;
  }
}

// Ekran için: önbellekte olanlar hemen puanlanır, eksikler arka planda çekilir; istemci
// "pending" sıfırlanana kadar birkaç saniyede bir yeniden sorar.
export async function rankMarketsProgressive(hs6: string, m49s: number[]): Promise<{ markets: MarketRow[]; pending: number[] }> {
  const countries = TARGET_COUNTRIES.filter((c) => m49s.includes(c.m49));
  const markets: MarketRow[] = [];
  const waiting: number[] = [];
  for (const c of countries) {
    if (c.access === 'engelli') {
      markets.push(scoreMarket(c, null, null));
      continue;
    }
    const hit = await latestTwoCached(c.m49, hs6);
    if (hit) markets.push(scoreMarket(c, hit[0], hit[1]));
    else {
      waiting.push(c.m49);
      pending.add(`${c.m49}:${hs6}`);
    }
  }
  if (waiting.length) void drain();
  markets.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return { markets, pending: waiting };
}

// Birden çok ülke; Comtrade'e aynı anda en çok 3 istek.
export async function rankMarkets(hs6: string, m49s: number[]): Promise<MarketRow[]> {
  const countries = TARGET_COUNTRIES.filter((c) => m49s.includes(c.m49));
  const out: MarketRow[] = [];
  const queue = [...countries];
  const worker = async () => {
    while (queue.length) {
      const c = queue.shift()!;
      if (c.access === 'engelli') {
        out.push(scoreMarket(c, null, null));
        continue;
      }
      try {
        const [cur, prev] = await latestTwo(c.m49, hs6);
        out.push(scoreMarket(c, cur, prev));
      } catch (err) {
        console.error('[export] comtrade', c.iso2, hs6, err instanceof Error ? err.message : err);
        out.push(scoreMarket(c, null, null));
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return out.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}
