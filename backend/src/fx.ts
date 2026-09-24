// TCMB günlük kurları (kullanıcı kuralı 2026-10-02): Türkiye'deki tüm TL maliyet hesapları ve
// işlemler TCMB USD/EUR DÖVİZ SATIŞ (ForexSelling) kurunu kullanır. Kaynak sabit adres
// (kullanıcı girdisi değil). TCMB iş günleri ~15:30 İstanbul'da yayınlar; hafta sonu/tatilde
// son bülten geçerlidir.
import { prisma } from './db';

export const FX_SOURCE_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml';
export const FX_SOURCE_LABEL = 'TCMB döviz satış';
const USER_AGENT = 'Mozilla/5.0 (compatible; TakyonBot/1.0; +https://takyon.ai)';
const TIMEOUT_MS = 10_000;
const INTERVAL_MS = 30 * 60 * 1000;
const STALE_DAYS = 4;
export const FX_CODES = ['USD', 'EUR', 'GBP'] as const;
export type FxCode = (typeof FX_CODES)[number];

export interface ParsedRate { code: FxCode; forexBuying: number; forexSelling: number }
export interface ParsedBulletin { date: string; rates: ParsedRate[] }

// "23.09.2026" → "2026-09-23"
function trDateToIso(s: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function num(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s.trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// today.xml ayrıştırıcı. Birim (Unit) 1 olmayan kurlar birime bölünür (USD/EUR/GBP için Unit=1).
export function parseTcmbXml(xml: string): ParsedBulletin | null {
  const dm = /<Tarih_Date[^>]*\bTarih="([^"]+)"/.exec(xml);
  const date = dm ? trDateToIso(dm[1]) : null;
  if (!date) return null;
  const rates: ParsedRate[] = [];
  const re = /<Currency\b[^>]*\bKod="([A-Z]{3})"[^>]*>([\s\S]*?)<\/Currency>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const code = m[1] as FxCode;
    if (!FX_CODES.includes(code)) continue;
    const body = m[2];
    const tag = (t: string) => new RegExp(`<${t}>([^<]*)</${t}>`).exec(body)?.[1];
    const unit = num(tag('Unit')) ?? 1;
    const sell = num(tag('ForexSelling'));
    const buy = num(tag('ForexBuying'));
    if (sell == null) continue;
    rates.push({ code, forexSelling: sell / unit, forexBuying: (buy ?? sell) / unit });
  }
  return rates.length ? { date, rates } : null;
}

export interface FxSnapshot {
  date: string;
  source: string;
  usd: number | null;
  eur: number | null;
  gbp: number | null;
  fetchedAt: string;
}

let memory: FxSnapshot | null = null;
let lastError: string | null = null;
let lastAttemptAt: Date | null = null;
let inflight: Promise<FxSnapshot | null> | null = null;

export async function fetchTcmb(): Promise<FxSnapshot | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    lastAttemptAt = new Date();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(FX_SOURCE_URL, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml, text/xml' }, signal: ctrl.signal });
      if (!r.ok) throw new Error(`http_${r.status}`);
      const parsed = parseTcmbXml(await r.text());
      if (!parsed) throw new Error('parse_failed');
      const fetchedAt = new Date();
      for (const rate of parsed.rates) {
        await prisma.fxRate.upsert({
          where: { date_code: { date: parsed.date, code: rate.code } },
          create: { date: parsed.date, code: rate.code, forexSelling: rate.forexSelling, forexBuying: rate.forexBuying, fetchedAt },
          update: { forexSelling: rate.forexSelling, forexBuying: rate.forexBuying, fetchedAt },
        });
      }
      const pick = (c: FxCode) => parsed.rates.find((x) => x.code === c)?.forexSelling ?? null;
      memory = { date: parsed.date, source: FX_SOURCE_LABEL, usd: pick('USD'), eur: pick('EUR'), gbp: pick('GBP'), fetchedAt: fetchedAt.toISOString() };
      lastError = null;
      return memory;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.error('[fx]', lastError);
      return null;
    } finally {
      clearTimeout(timer);
      inflight = null;
    }
  })();
  return inflight;
}

async function latestFromDb(): Promise<FxSnapshot | null> {
  const last = await prisma.fxRate.findFirst({ orderBy: [{ date: 'desc' }, { fetchedAt: 'desc' }] });
  if (!last) return null;
  const rows = await prisma.fxRate.findMany({ where: { date: last.date } });
  const pick = (c: FxCode) => rows.find((x) => x.code === c)?.forexSelling ?? null;
  const fetchedAt = rows.reduce((a, r) => (r.fetchedAt > a ? r.fetchedAt : a), last.fetchedAt);
  return { date: last.date, source: FX_SOURCE_LABEL, usd: pick('USD'), eur: pick('EUR'), gbp: pick('GBP'), fetchedAt: fetchedAt.toISOString() };
}

// Güncel kurlar: DB → bellek → (ikisi de boşsa) anında çekme.
export async function getRates(): Promise<FxSnapshot | null> {
  const db = await latestFromDb().catch(() => null);
  if (db && (!memory || db.date >= memory.date)) return db;
  if (memory) return memory;
  return fetchTcmb();
}

// İstanbul (UTC+3, yaz saati yok) takvim/saat bilgisi.
function istanbulNow(now = new Date()) {
  const t = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return { date: t.toISOString().slice(0, 10), weekday: t.getUTCDay(), minutes: t.getUTCHours() * 60 + t.getUTCMinutes() };
}

// Yeni bülten bekleniyor mu: hafta içi 15:35 sonrası ve elimizdeki bülten bugünün değil.
export function expectsNewBulletin(latestDate: string | null, now = new Date()): boolean {
  if (!latestDate) return true;
  const ist = istanbulNow(now);
  const weekday = ist.weekday >= 1 && ist.weekday <= 5;
  return weekday && ist.minutes >= 15 * 60 + 35 && latestDate < ist.date;
}

export function isStale(date: string, now = new Date()): boolean {
  const ageDays = (Date.parse(istanbulNow(now).date) - Date.parse(date)) / 86_400_000;
  return ageDays > STALE_DAYS;
}

export function startFxScheduler() {
  if (process.env.FX_DISABLED === '1') return;
  void fetchTcmb();
  setInterval(async () => {
    const cur = await getRates().catch(() => null);
    if (expectsNewBulletin(cur?.date ?? null)) await fetchTcmb();
  }, INTERVAL_MS).unref();
}

export async function fxHealth() {
  const r = await getRates().catch(() => null);
  return {
    date: r?.date ?? null,
    usd: r?.usd ?? null,
    eur: r?.eur ?? null,
    fetchedAt: r?.fetchedAt ?? null,
    stale: r ? isStale(r.date) : true,
    lastError,
    lastAttemptAt: lastAttemptAt?.toISOString() ?? null,
  };
}

// Asistan bağlamına eklenen satır.
export function fxContextLine(r: FxSnapshot | null): string {
  if (!r || (r.usd == null && r.eur == null)) {
    return 'Güncel TCMB kuru şu an alınamadı; kur gereken hesapta kullanıcıdan kuru iste.';
  }
  const [y, m, d] = r.date.split('-');
  const f = (n: number | null) => (n == null ? '?' : n.toFixed(4).replace('.', ','));
  return `Güncel kur (TCMB döviz satış, ${d}.${m}.${y}): 1 USD = ${f(r.usd)} TL, 1 EUR = ${f(r.eur)} TL. Kur sorulmadıkça bunu kullan, kullanıcıya hangi kuru kullandığını söyle.`;
}

// Hesap becerisi girdisinde kur alanı (usdTry/eurTry) boş ya da 0 ise TCMB döviz satışıyla doldurur.
// Girdi yerinde değiştirilir; kullanılan kur bilgisi döner (yoksa null).
export async function fillFxDefaults(schemaShape: Record<string, unknown> | undefined, input: unknown) {
  if (!schemaShape || !input || typeof input !== 'object') return null;
  if (!('usdTry' in schemaShape) && !('eurTry' in schemaShape)) return null;
  const a = input as Record<string, unknown>;
  const needUsd = 'usdTry' in schemaShape && !(Number(a.usdTry) > 0);
  const needEur = 'eurTry' in schemaShape && !(Number(a.eurTry) > 0);
  if (!needUsd && !needEur) return null;
  const fx = await getRates().catch(() => null);
  if (!fx) return null;
  if (needUsd && fx.usd) a.usdTry = fx.usd;
  if (needEur && fx.eur) a.eurTry = fx.eur;
  return { date: fx.date, source: FX_SOURCE_LABEL };
}
