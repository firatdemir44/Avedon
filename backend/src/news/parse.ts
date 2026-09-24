// Sektör gündemi: küçük RSS 2.0 / Atom ayrıştırıcı (bağımlılıksız).
// Telif: yalnızca başlık, kısa özet (HTML'siz, ≤ SUMMARY_MAX), bağlantı, tarih okunur.
import { decodeEntities } from '../linkPreview';

export const SUMMARY_MAX = 200;
export const TITLE_MAX = 300;

export type FeedEntry = { guid: string; url: string; title: string; summary: string; publishedAt: Date | null };

function unCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

// Metin: CDATA açılır, etiketler atılır, varlıklar çözülür (kodlanmış HTML için iki tur), boşluk sadeleşir.
export function cleanText(raw: string): string {
  let s = unCdata(raw);
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ');
  s = decodeEntities(s); // &lt;p&gt; gibi kodlanmış HTML açığa çıkar
  s = s.replace(/<[^>]*>/g, ' ');
  s = decodeEntities(s);
  return s.replace(/\s+/g, ' ').trim();
}

export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–-]+$/, '') + '…';
}

function tagContent(block: string, names: string[]): string | null {
  for (const name of names) {
    const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (m) return m[1];
  }
  return null;
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? decodeEntities(m[2] ?? m[3] ?? '') : null;
}

function atomLink(block: string): string | null {
  const links = block.match(/<link\b[^>]*>/gi) ?? [];
  let fallback: string | null = null;
  for (const l of links) {
    const href = attr(l, 'href');
    if (!href) continue;
    const rel = attr(l, 'rel');
    if (!rel || rel === 'alternate') return href;
    fallback ??= href;
  }
  return fallback;
}

export function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const s = cleanText(raw);
  if (!s) return null;
  let d = new Date(s);
  if (Number.isNaN(d.getTime())) d = new Date(s.replace(/^[^,]*,\s*/, ''));
  return Number.isNaN(d.getTime()) ? null : d;
}

function httpUrl(s: string | null): string | null {
  if (!s) return null;
  try {
    const u = new URL(cleanText(s));
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function parseFeed(xml: string): FeedEntry[] {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  const out: FeedEntry[] = [];
  for (const b of blocks) {
    const isAtom = /^<entry/i.test(b);
    const title = clip(cleanText(tagContent(b, ['title']) ?? ''), TITLE_MAX);
    const linkRaw = isAtom ? atomLink(b) : (tagContent(b, ['link']) ?? atomLink(b));
    const guidRaw = tagContent(b, ['guid', 'id']);
    const url = httpUrl(linkRaw) ?? httpUrl(guidRaw);
    if (!title || !url) continue;
    const summaryRaw = tagContent(b, ['description', 'summary', 'content:encoded', 'content']) ?? '';
    const summary = clip(cleanText(summaryRaw), SUMMARY_MAX);
    const publishedAt = parseDate(tagContent(b, ['pubDate', 'published', 'updated', 'dc:date']));
    const guid = (guidRaw ? cleanText(guidRaw) : '') || url;
    out.push({ guid: guid.slice(0, 500), url, title, summary, publishedAt });
  }
  return out;
}
