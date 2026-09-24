// Sektör gündemi: kaynakları sırayla çeker, etiketler, kaydeder; 2 saatte bir çalışır, 30 günden eski haberleri siler.
// Kaynak adresleri sabit (kullanıcı girdisi değil), bu yüzden SSRF denetimi gerekmez.
import { prisma } from '../db';
import { USER_AGENT } from '../linkPreview';
import { parseFeed, type FeedEntry } from './parse';
import { isTextileRelated, tagTopics } from './topics';

export type NewsSource = { key: string; name: string; url: string; lang: 'tr' | 'en'; textileFilter?: boolean };

export const NEWS_SOURCES: NewsSource[] = [
  { key: 'tekstilhaber', name: 'Tekstil Haber', url: 'https://www.tekstilhaber.com/feed/', lang: 'tr' },
  { key: 'tekstilteknik', name: 'Tekstil Teknik', url: 'https://www.tekstilteknik.com.tr/feed/', lang: 'tr' },
  { key: 'textilegence', name: 'Textilegence', url: 'https://www.textilegence.com/feed/', lang: 'tr' },
  { key: 'dunya', name: 'Dünya', url: 'https://www.dunya.com/rss?dunya=sektorler', lang: 'tr', textileFilter: true },
  { key: 'textileworld', name: 'Textile World', url: 'https://www.textileworld.com/feed/', lang: 'en' },
  { key: 'innovationintextiles', name: 'Innovation in Textiles', url: 'https://www.innovationintextiles.com/rss/', lang: 'en' },
  { key: 'knittingindustry', name: 'Knitting Industry', url: 'https://www.knittingindustry.com/rss/', lang: 'en' },
];
export const sourceName = (key: string) => NEWS_SOURCES.find((s) => s.key === key)?.name ?? key;

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 1_000_000;
const GAP_MS = 1000;
const INTERVAL_MS = 2 * 60 * 60 * 1000;
const FIRST_RUN_MS = 2 * 60 * 1000;
export const KEEP_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

type SourceState = { ok: boolean; error: string | null; items: number; at: string; etag?: string; lastModified?: string };
const state = new Map<string, SourceState>();
let lastFetchAt: Date | null = null;
let running = false;

async function download(src: NewsSource): Promise<string | null> {
  const prev = state.get(src.key);
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' };
  if (prev?.etag) headers['If-None-Match'] = prev.etag;
  if (prev?.lastModified) headers['If-Modified-Since'] = prev.lastModified;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(src.url, { headers, signal: ctrl.signal, redirect: 'follow' });
    if (res.status === 304) return null;
    if (!res.ok) throw new Error(`http_${res.status}`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error('empty_body');
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        break; // ilk 1 MB yeter; yarım kalan son öğe ayrıştırıcıda atlanır
      }
      chunks.push(value);
    }
    const buf = Buffer.concat(chunks);
    const head = buf.subarray(0, 200).toString('latin1');
    const charset = (res.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] ?? head.match(/encoding=["']([\w-]+)/i)?.[1] ?? 'utf-8').toLowerCase();
    let text: string;
    try {
      text = new TextDecoder(charset).decode(buf);
    } catch {
      text = buf.toString('utf8');
    }
    state.set(src.key, { ...(prev ?? { ok: true, error: null, items: 0, at: '' }), etag: res.headers.get('etag') ?? undefined, lastModified: res.headers.get('last-modified') ?? undefined });
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export type StoredCandidate = { source: string; guid: string; url: string; title: string; summary: string; lang: string; topics: string[]; publishedAt: Date };

export function prepareEntries(src: NewsSource, entries: FeedEntry[], now: Date): StoredCandidate[] {
  const cutoff = now.getTime() - KEEP_DAYS * DAY;
  return entries
    .filter((e) => !src.textileFilter || isTextileRelated(e.title, e.summary))
    .map((e) => {
      // Tarihsiz ya da gelecekteki tarih: çekildiği an kabul edilir.
      const at = e.publishedAt && e.publishedAt.getTime() <= now.getTime() + 60 * 60 * 1000 ? e.publishedAt : now;
      return { source: src.key, guid: e.guid, url: e.url, title: e.title, summary: e.summary, lang: src.lang, topics: tagTopics(e.title, e.summary), publishedAt: at };
    })
    .filter((c) => c.publishedAt.getTime() >= cutoff);
}

async function store(items: StoredCandidate[]): Promise<number> {
  let n = 0;
  for (const c of items) {
    const data = { url: c.url, title: c.title, summary: c.summary, lang: c.lang, topicsJson: JSON.stringify(c.topics) };
    await prisma.newsItem.upsert({
      where: { source_guid: { source: c.source, guid: c.guid } },
      create: { source: c.source, guid: c.guid, publishedAt: c.publishedAt, ...data },
      update: data,
    });
    n++;
  }
  return n;
}

export async function fetchSource(src: NewsSource, now = new Date()): Promise<number> {
  try {
    const xml = await download(src);
    const prev = state.get(src.key);
    if (xml === null) {
      state.set(src.key, { ...(prev as SourceState), ok: true, error: null, items: 0, at: now.toISOString() });
      return 0;
    }
    const entries = parseFeed(xml);
    if (!entries.length) throw new Error('no_items');
    const n = await store(prepareEntries(src, entries, now));
    state.set(src.key, { ...(state.get(src.key) as SourceState), ok: true, error: null, items: n, at: now.toISOString() });
    return n;
  } catch (err) {
    const msg = err instanceof Error ? (err.name === 'AbortError' ? 'timeout' : err.message) : String(err);
    state.set(src.key, { ...(state.get(src.key) ?? { items: 0 }), ok: false, error: msg.slice(0, 120), items: 0, at: now.toISOString() });
    console.error(`[news] ${src.key}: ${msg}`);
    return 0;
  }
}

export async function pruneOld(now = new Date()) {
  const r = await prisma.newsItem.deleteMany({ where: { publishedAt: { lt: new Date(now.getTime() - KEEP_DAYS * DAY) } } });
  return r.count;
}

export async function fetchAllNews(): Promise<Record<string, number>> {
  if (running) return {};
  running = true;
  const out: Record<string, number> = {};
  try {
    for (const [i, src] of NEWS_SOURCES.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, GAP_MS));
      out[src.key] = await fetchSource(src);
    }
    await pruneOld();
    lastFetchAt = new Date();
  } finally {
    running = false;
  }
  return out;
}

export function startNewsScheduler() {
  if (process.env.NEWS_DISABLED === '1') return;
  const run = () => void fetchAllNews().catch((e) => console.error('[news]', e));
  setTimeout(() => {
    run();
    setInterval(run, INTERVAL_MS).unref();
  }, FIRST_RUN_MS).unref();
}

export async function newsHealth() {
  const perSource: Record<string, { ok: boolean; error: string | null; items: number; at: string } | null> = {};
  for (const s of NEWS_SOURCES) {
    const st = state.get(s.key);
    perSource[s.key] = st ? { ok: st.ok, error: st.error, items: st.items, at: st.at } : null;
  }
  return { count: await prisma.newsItem.count(), lastFetchAt: lastFetchAt?.toISOString() ?? null, perSource };
}
