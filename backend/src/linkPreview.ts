// Akışta paylaşılan haber/makale bağlantıları için önizleme (LinkedIn benzeri kart).
// Güvenlik: yalnızca http/https; her bağlantıda (yönlendirmeler dahil) DNS çözümü
// yapılıp özel/yerel adresler reddedilir (SSRF). Çözülen adres doğrudan bağlantıda
// kullanılır (lookup kancası), böylece kontrol ile bağlantı arasında DNS değişemez.
// Telif: makale metni kopyalanmaz; açıklama en fazla 240 karakter.
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import type { LookupFunction } from 'node:net';

export const USER_AGENT = 'Mozilla/5.0 (compatible; TakyonBot/1.0; +https://takyon.ai)';
const TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 1_500_000;
const MAX_IMAGE_BYTES = 1_500_000;
export const DESCRIPTION_MAX = 240;
export const TITLE_MAX = 300;
const CACHE_TTL_MS = 60 * 60 * 1000;

export type LinkPreview = {
  url: string;
  title: string;
  description: string;
  siteName: string;
  imageDataUrl: string | null;
};

// ---- SSRF: özel adres denetimi ----

function ipv4Private(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // link-local / bulut metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && (p[2] === 0 || p[2] === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && p[2] === 100) return true;
  if (a === 203 && b === 0 && p[2] === 113) return true;
  if (a >= 224) return true; // multicast + ayrılmış + yayın
  return false;
}

export function isPrivateIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return ipv4Private(ip);
  if (v !== 6) return true;
  const low = ip.toLowerCase().split('%')[0];
  const mapped = low.match(/^(?:0{0,4}:){0,5}(?:0{0,4}:)?ffff:(\d+\.\d+\.\d+\.\d+)$/) ?? low.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Private(mapped[1]);
  const hexMapped = low.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16), lo = parseInt(hexMapped[2], 16);
    return ipv4Private(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (low === '::' || low === '::1') return true;
  const first = parseInt(low.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // link-local
  if ((first & 0xff00) === 0xff00) return true; // multicast
  if (low.startsWith('64:ff9b:')) return true; // NAT64
  if (low.startsWith('2001:db8:')) return true;
  return false;
}

class PreviewError extends Error {}

// http(s).request için lookup kancası: tüm adresleri çözer, biri bile özelse reddeder.
const safeLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return (callback as (e: Error | null, a: string, f: number) => void)(err, '', 4);
    const list = addresses as dns.LookupAddress[];
    if (!list.length || list.some((a) => isPrivateIp(a.address))) {
      return (callback as (e: Error | null, a: string, f: number) => void)(new PreviewError('private_address'), '', 4);
    }
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    (callback as (e: null, a: string, f: number) => void)(null, list[0].address, list[0].family);
  });
};

export function parseHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.username || u.password) return null;
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;
    if (net.isIP(host) && isPrivateIp(host)) return null;
    if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) return null;
    u.hash = '';
    return u;
  } catch {
    return null;
  }
}

type Fetched = { finalUrl: URL; contentType: string; body: Buffer; truncated: boolean };

function requestOnce(url: URL, accept: string, maxBytes: number, deadline: number): Promise<{ status: number; location?: string; contentType: string; body: Buffer; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new PreviewError('timeout'));
    const req = lib.request(
      url,
      {
        method: 'GET',
        lookup: safeLookup,
        headers: { 'User-Agent': USER_AGENT, Accept: accept, 'Accept-Language': 'tr,en;q=0.8' },
        timeout: remaining,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers['content-type'] ?? '').toLowerCase();
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: res.headers.location, contentType, body: Buffer.alloc(0), truncated: false });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        res.on('data', (c: Buffer) => {
          if (truncated) return;
          size += c.length;
          if (size > maxBytes) {
            truncated = true;
            chunks.push(c.subarray(0, c.length - (size - maxBytes)));
            res.destroy();
            resolve({ status, contentType, body: Buffer.concat(chunks), truncated });
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => resolve({ status, contentType, body: Buffer.concat(chunks), truncated }));
        res.on('error', (e) => (truncated ? undefined : reject(e)));
      }
    );
    const timer = setTimeout(() => req.destroy(new PreviewError('timeout')), remaining);
    req.on('close', () => clearTimeout(timer));
    req.on('timeout', () => req.destroy(new PreviewError('timeout')));
    req.on('error', reject);
    req.end();
  });
}

async function safeFetch(start: URL, accept: string, maxBytes: number): Promise<Fetched> {
  const deadline = Date.now() + TIMEOUT_MS;
  let url = start;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const r = await requestOnce(url, accept, maxBytes, deadline);
    if (r.status >= 300 && r.status < 400) {
      if (!r.location) throw new PreviewError('bad_redirect');
      const next = parseHttpUrl(new URL(r.location, url).toString());
      if (!next) throw new PreviewError('bad_redirect');
      url = next;
      continue;
    }
    if (r.status < 200 || r.status >= 300) throw new PreviewError(`http_${r.status}`);
    return { finalUrl: url, contentType: r.contentType, body: r.body, truncated: r.truncated };
  }
  throw new PreviewError('too_many_redirects');
}

// ---- HTML ayrıştırma (bağımlılıksız, yalnızca baş etiketler ve birkaç gövde öğesi) ----

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', laquo: '«', raquo: '»' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return Number.isFinite(code) ? String.fromCodePoint(code) : m; } catch { return m; }
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function clean(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–-]+$/, '') + '…';
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '');
  return out;
}

function absolutize(src: string, base: URL): string | null {
  try {
    const u = new URL(src, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

const SKIP_IMG = /(logo|icon|sprite|avatar|banner-ad|pixel|spacer|blank|loading|placeholder|facebook|twitter|instagram|linkedin|whatsapp|youtube|flag|emoji|badge)/i;

export type ParsedHtml = { title: string; description: string; siteName: string; imageUrl: string | null };

export function parseHtml(html: string, pageUrl: URL): ParsedHtml {
  const head = html.slice(0, 400_000);
  const meta: Record<string, string> = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.property || a.name || a.itemprop || '').toLowerCase();
    if (key && a.content && !(key in meta)) meta[key] = a.content.trim();
  }
  const hostSite = pageUrl.hostname.replace(/^www\./i, '');
  let siteName = clean(meta['og:site_name'] || meta['application-name'] || '');
  let title = clean(meta['og:title'] || meta['twitter:title'] || '');
  if (!title) {
    const t = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    title = t ? clean(t[1]) : '';
    // "Başlık - Site Adı" / "Başlık | Site Adı": sondaki parça site adı olarak ayrılır.
    const parts = title.split(/\s+[-|–—·]\s+/);
    if (parts.length >= 2) {
      const first = parts[0];
      const rest = parts.slice(1).join(' - ');
      const restLow = rest.toLocaleLowerCase('tr');
      const hostWord = hostSite.split('.')[0].toLocaleLowerCase('tr');
      const matches = (siteName && restLow.includes(siteName.toLocaleLowerCase('tr'))) || restLow.replace(/[^a-z0-9]/g, '').includes(hostWord.replace(/[^a-z0-9]/g, '')) || asciiFold(restLow).includes(asciiFold(hostWord));
      if (matches && first.length >= 3) {
        title = first;
        if (!siteName) siteName = rest;
      }
    }
  }
  if (!title) {
    const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1) title = clean(h1[1]);
  }
  let description = clean(meta['og:description'] || meta['twitter:description'] || meta['description'] || '');
  const body = contentRegion(html);
  // Bazı siteler açıklamaya yalnızca başlık + site adını yazar; o zaman gövdeden ilk paragraf alınır.
  if (description && weakDescription(description, title, siteName || hostSite)) description = "";
  if (!description) description = firstParagraph(body);
  let imageUrl: string | null = null;
  const ogImg = meta['og:image'] || meta['og:image:url'] || meta['og:image:secure_url'] || meta['twitter:image'] || meta['twitter:image:src'];
  if (ogImg) imageUrl = absolutize(ogImg, pageUrl);
  if (!imageUrl) imageUrl = firstContentImage(body, pageUrl);
  return {
    title: clip(title, TITLE_MAX),
    description: clip(description, DESCRIPTION_MAX),
    siteName: clip(siteName || hostSite, 100),
    imageUrl,
  };
}

function weakDescription(desc: string, title: string, site: string): boolean {
  let rest = asciiFold(desc.toLocaleLowerCase('tr'));
  for (const part of [title, site, ...site.split(/\s+[-|–—,]\s+|,\s*/)]) {
    const f = asciiFold(part.toLocaleLowerCase('tr'));
    if (f) rest = rest.split(f).join('');
  }
  return rest.length < 20;
}

// Blok etiketleri satır sonuna çevrilir; 60+ karakterlik ilk metin satırı paragraf sayılır.
function firstParagraph(region: string): string {
  const text = decodeEntities(
    region
      .replace(/<\/?(br|p|div|li|h[1-6]|td|tr|section|figure|blockquote)\b[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
  );
  for (const line of text.split('\n')) {
    const t = line.replace(/\s+/g, ' ').trim();
    if (t.length >= 60 && !/^(copyright|©|tüm hakları|her hakkı|cookie|çerez|you are using)/i.test(t)) return t;
  }
  return '';
}

function asciiFold(s: string): string {
  return s.replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').normalize('NFD').replace(/[^a-z0-9]/g, '');
}

// Makale gövdesi: <article>, <main> ya da içerik sınıflı bir bölüm; yoksa <body>.
function contentRegion(html: string): string {
  const noScript = html.replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ');
  const pick = (re: RegExp) => noScript.match(re)?.[1];
  return (
    pick(/<article\b[^>]*>([\s\S]*?)<\/article>/i) ??
    pick(/<main\b[^>]*>([\s\S]*?)<\/main>/i) ??
    (() => {
      const i = noScript.search(/<(div|section)\b[^>]*(class|id)\s*=\s*["'][^"']*(haber|detay|detail|content|icerik|article|post|entry|news)[^"']*["']/i);
      return i >= 0 ? noScript.slice(i) : null;
    })() ??
    pick(/<body\b[^>]*>([\s\S]*)<\/body>/i) ??
    noScript
  ).replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ');
}

function firstContentImage(region: string, base: URL): string | null {
  let fallback: string | null = null;
  for (const m of region.matchAll(/<img\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const src = a['data-src'] || a['data-lazy-src'] || a.src || (a.srcset ? a.srcset.split(',')[0].trim().split(/\s+/)[0] : '');
    if (!src || src.startsWith('data:')) continue;
    const hay = `${src} ${a.alt ?? ''} ${a.class ?? ''} ${a.id ?? ''}`;
    if (SKIP_IMG.test(hay)) continue;
    const w = parseInt(a.width ?? '', 10);
    const h = parseInt(a.height ?? '', 10);
    if ((w && w < 200) || (h && h < 120)) continue;
    const abs = absolutize(src, base);
    if (!abs) continue;
    if (/\.(jpe?g|png|webp)(\?|$)/i.test(abs)) return abs;
    if (!fallback && !/\.(svg|gif|ico)(\?|$)/i.test(abs)) fallback = abs;
  }
  return fallback;
}

// ---- Görsel indirme ----

async function fetchImageDataUrl(raw: string): Promise<string | null> {
  const url = parseHttpUrl(raw);
  if (!url) return null;
  try {
    const r = await safeFetch(url, 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8', MAX_IMAGE_BYTES + 1);
    const type = r.contentType.split(';')[0].trim();
    if (r.truncated || r.body.length > MAX_IMAGE_BYTES || r.body.length < 500) return null;
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(type)) return null;
    return `data:${type};base64,${r.body.toString('base64')}`;
  } catch {
    return null;
  }
}

function decodeHtml(buf: Buffer, contentType: string): string {
  const head = buf.subarray(0, 4096).toString('latin1');
  const charset = (contentType.match(/charset=([\w-]+)/i)?.[1] || head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] || 'utf-8').toLowerCase();
  try {
    return new TextDecoder(charset === 'iso-8859-9' || charset === 'windows-1254' ? 'windows-1254' : charset).decode(buf);
  } catch {
    return buf.toString('utf8');
  }
}

// ---- Genel giriş ----

const cache = new Map<string, { at: number; value: LinkPreview }>();

export async function fetchPreview(raw: string): Promise<LinkPreview> {
  const url = parseHttpUrl(raw);
  if (!url) throw new PreviewError('invalid_url');
  const key = url.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const page = await safeFetch(url, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', MAX_HTML_BYTES);
  if (page.contentType && !/html|xml/.test(page.contentType)) throw new PreviewError('not_html');
  const parsed = parseHtml(decodeHtml(page.body, page.contentType), page.finalUrl);
  const imageDataUrl = parsed.imageUrl ? await fetchImageDataUrl(parsed.imageUrl) : null;
  const value: LinkPreview = { url: key, title: parsed.title, description: parsed.description, siteName: parsed.siteName, imageDataUrl };
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return value;
}

export function isPreviewError(err: unknown): err is Error {
  return err instanceof PreviewError;
}

// Metinde geçen ilk http(s) bağlantısı (istemci de aynı kuralı kullanır).
export function firstUrlIn(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[),.;:!?]+$/, '') : null;
}
