// Kibar tarayıcı: tek sıra, istekler arası en az 800 ms (robots Crawl-delay
// daha uzunsa o), robots.txt Disallow'a uyar, yalnızca verilen adresin
// alan adına gider.

export const USER_AGENT = 'TakyonBot/1.0 (+https://takyon.ai)';
export const MIN_DELAY_MS = 800;
export const MAX_PAGES = 150;
const MAX_HTML_BYTES = 3_000_000;
const TIMEOUT_MS = 20_000;

export interface RobotsRules {
  allow: string[];
  disallow: string[];
  crawlDelayMs: number | null;
}

// Yalnızca "*" ve "takyonbot" grupları; özel grup varsa o geçerli.
export function parseRobots(text: string): RobotsRules {
  type Group = { agents: string[]; allow: string[]; disallow: string[]; delay: number | null };
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [], delay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === 'disallow' && value) current.disallow.push(value);
    else if (field === 'allow' && value) current.allow.push(value);
    else if (field === 'crawl-delay') {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.delay = n;
    }
  }
  const own = groups.find((g) => g.agents.some((a) => a.includes('takyonbot')));
  const star = groups.find((g) => g.agents.includes('*'));
  const g = own ?? star;
  return {
    allow: g?.allow ?? [],
    disallow: g?.disallow ?? [],
    crawlDelayMs: g?.delay != null ? Math.min(g.delay, 30) * 1000 : null,
  };
}

const patternToRegex = (p: string) =>
  new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));

// En uzun eşleşen kural kazanır (Google yorumu); eşitlikte Allow.
export function isAllowed(rules: RobotsRules, path: string) {
  let best: { len: number; allow: boolean } | null = null;
  for (const [list, allow] of [
    [rules.disallow, false],
    [rules.allow, true],
  ] as const) {
    for (const p of list) {
      if (patternToRegex(p).test(path) && (!best || p.length > best.len || (p.length === best.len && allow))) {
        best = { len: p.length, allow };
      }
    }
  }
  return best ? best.allow : true;
}

export class ScanError extends Error {
  constructor(public code: 'invalid_url' | 'unreachable' | 'robots_disallow' | 'no_products') {
    super(code);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class PoliteFetcher {
  private last = 0;
  private rules: RobotsRules = { allow: [], disallow: [], crawlDelayMs: null };
  readonly origin: string;
  readonly host: string;

  constructor(startUrl: string, private fetchImpl: typeof fetch = fetch) {
    const u = new URL(startUrl);
    this.origin = u.origin;
    this.host = u.host;
  }

  get delayMs() {
    return Math.max(MIN_DELAY_MS, this.rules.crawlDelayMs ?? 0);
  }

  async init() {
    try {
      const res = await this.raw(`${this.origin}/robots.txt`);
      if (res.ok) this.rules = parseRobots(await res.text());
    } catch {
      // robots.txt yoksa her şeye izin var sayılır.
    }
    return this.rules;
  }

  sameHost(url: string) {
    try {
      // "www." farkı aynı site sayılır (çoğu site birinden ötekine yönlendirir).
      const bare = (h: string) => h.replace(/^www\./i, '').toLowerCase();
      return bare(new URL(url).host) === bare(this.host);
    } catch {
      return false;
    }
  }

  allowed(url: string) {
    const u = new URL(url);
    return this.sameHost(url) && isAllowed(this.rules, u.pathname + u.search);
  }

  private async raw(url: string) {
    const wait = this.last + this.delayMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.last = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      return await this.fetchImpl(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
        redirect: 'manual',
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  // Aynı alan adı + robots izni yoksa istek atılmaz (null).
  // Yönlendirmeler elle izlenir: başka alan adına (ya da iç ağa) giden yönlendirme izlenmez.
  async get(url: string): Promise<Response | null> {
    let current = url;
    for (let hop = 0; hop < 4; hop++) {
      if (!this.allowed(current)) return null;
      const res = await this.raw(current);
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        current = new URL(location, current).toString();
        continue;
      }
      return res;
    }
    return null;
  }

  async text(url: string): Promise<string | null> {
    const res = await this.get(url).catch(() => null);
    if (!res || !res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_HTML_BYTES) return null;
    return new TextDecoder('utf-8').decode(buf);
  }

  async json<T>(url: string): Promise<{ data: T; headers: Headers } | null> {
    const res = await this.get(url).catch(() => null);
    if (!res || !res.ok) return null;
    try {
      return { data: (await res.json()) as T, headers: res.headers };
    } catch {
      return null;
    }
  }

  async bytes(url: string, maxBytes: number): Promise<{ data: Buffer; contentType: string } | null> {
    const res = await this.get(url).catch(() => null);
    if (!res || !res.ok) return null;
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len && len > maxBytes) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) return null;
    return { data: buf, contentType: (res.headers.get('content-type') ?? '').split(';')[0].trim() };
  }
}

export interface CatalogEntry {
  url: string;
  name: string;
  featuredImage: string | null;
}

interface WpProduct {
  link?: string;
  title?: { rendered?: string };
  _embedded?: { 'wp:featuredmedia'?: { source_url?: string }[] };
}

const PRODUCT_PATH = /\/(product|products|urun|urunler|ürün|ürünler|kumas|kumaslar|fabric|fabrics|item|shop|katalog|catalog)[/-]/i;

// WordPress + WooCommerce: REST uç noktasından ürün listesi.
async function listWordPress(f: PoliteFetcher): Promise<CatalogEntry[] | null> {
  const types = await f.json<Record<string, unknown>>(`${f.origin}/wp-json/wp/v2/types`);
  if (!types || typeof types.data !== 'object' || !types.data || !('product' in types.data)) return null;
  const out: CatalogEntry[] = [];
  for (let page = 1; page <= 5 && out.length < MAX_PAGES; page++) {
    const r = await f.json<WpProduct[]>(`${f.origin}/wp-json/wp/v2/product?per_page=100&page=${page}&_embed=1`);
    if (!r || !Array.isArray(r.data)) break;
    for (const p of r.data) {
      if (!p.link || !f.sameHost(p.link)) continue;
      out.push({
        url: p.link,
        name: (p.title?.rendered ?? '').replace(/<[^>]+>/g, '').trim(),
        featuredImage: p._embedded?.['wp:featuredmedia']?.[0]?.source_url ?? null,
      });
    }
    const totalPages = Number(r.headers.get('x-wp-totalpages') ?? 1);
    if (page >= totalPages || r.data.length < 100) break;
  }
  return out;
}

const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));

// Genel yedek: site haritası; o da yoksa başlangıç sayfasındaki ürün bağlantıları.
async function listGeneric(f: PoliteFetcher, startUrl: string): Promise<CatalogEntry[]> {
  const urls = new Set<string>();
  const sitemaps = [`${f.origin}/sitemap.xml`, `${f.origin}/sitemap_index.xml`, `${f.origin}/wp-sitemap.xml`];
  for (const sm of sitemaps) {
    const xml = await f.text(sm);
    if (!xml) continue;
    const entries = locs(xml).filter((u) => f.sameHost(u));
    const children = entries.filter((u) => /\.xml(\?|$)/i.test(u));
    const pages = entries.filter((u) => !/\.xml(\?|$)/i.test(u));
    pages.filter((u) => PRODUCT_PATH.test(new URL(u).pathname)).forEach((u) => urls.add(u));
    // Önce adında "product/urun" geçen alt haritalar.
    const ordered = [...children.filter((u) => /product|urun|ürün/i.test(u)), ...children.filter((u) => !/product|urun|ürün/i.test(u))];
    for (const child of ordered.slice(0, 5)) {
      if (urls.size >= MAX_PAGES) break;
      const cx = await f.text(child);
      if (!cx) continue;
      const childLocs = locs(cx).filter((u) => f.sameHost(u) && !/\.xml(\?|$)/i.test(u));
      const isProductMap = /product|urun|ürün/i.test(child);
      childLocs.filter((u) => isProductMap || PRODUCT_PATH.test(new URL(u).pathname)).forEach((u) => urls.add(u));
    }
    if (urls.size) break;
  }
  if (!urls.size) {
    const html = await f.text(startUrl);
    if (html) {
      for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*"([^"#]+)"/gi)) {
        try {
          const abs = new URL(m[1], startUrl).toString();
          if (f.sameHost(abs) && PRODUCT_PATH.test(new URL(abs).pathname)) urls.add(abs.split('#')[0]);
        } catch {
          // geçersiz bağlantı
        }
      }
    }
  }
  return [...urls]
    .filter((u) => f.allowed(u))
    .slice(0, MAX_PAGES)
    .map((url) => ({ url, name: '', featuredImage: null }));
}

export function normalizeStartUrl(input: string): string {
  let value = input.trim();
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  const u = new URL(value);
  if (!/^https?:$/.test(u.protocol)) throw new ScanError('invalid_url');
  // İç ağ / yerel adreslere gidilmez (SSRF).
  const h = u.hostname.toLowerCase();
  if (
    h === 'localhost' ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h.includes(':') ||
    !h.includes('.')
  ) {
    throw new ScanError('invalid_url');
  }
  return u.toString();
}

export async function fetchCatalog(f: PoliteFetcher, startUrl: string): Promise<CatalogEntry[]> {
  await f.init();
  if (!f.allowed(startUrl)) throw new ScanError('robots_disallow');
  const wp = await listWordPress(f);
  const entries = wp && wp.length ? wp : await listGeneric(f, startUrl);
  return entries.filter((e) => f.allowed(e.url)).slice(0, MAX_PAGES);
}
