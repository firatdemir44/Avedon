// Sektör gündemi: günlük özet ve liste sorguları (rota ve asistan aracı ortak kullanır).
import { prisma } from '../db';
import { sourceName } from './fetch';
import { rankDigest } from './rank';
import { topicLabel } from './topics';

export type NewsDto = { id: string; title: string; summary: string; url: string; source: string; sourceKey: string; lang: string; topics: { key: string; label: string }[]; publishedAt: string };

type Row = { id: string; source: string; url: string; title: string; summary: string; lang: string; topicsJson: string; publishedAt: Date };

function topicsOf(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function toDto(r: Row): NewsDto {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    url: r.url,
    source: sourceName(r.source),
    sourceKey: r.source,
    lang: r.lang,
    topics: topicsOf(r.topicsJson).map((k) => ({ key: k, label: topicLabel(k) })),
    publishedAt: r.publishedAt.toISOString(),
  };
}

const SELECT = { id: true, source: true, url: true, title: true, summary: true, lang: true, topicsJson: true, publishedAt: true } as const;
const DAY = 24 * 60 * 60 * 1000;

export async function buildDigest(companyType: string, now = new Date(), limit = 5): Promise<NewsDto[]> {
  // Son 7 gün (yetmezse 30 gün) içinden kişiselleştirilmiş seçim.
  let rows = await prisma.newsItem.findMany({ where: { publishedAt: { gte: new Date(now.getTime() - 7 * DAY) } }, select: SELECT, orderBy: { publishedAt: 'desc' }, take: 400 });
  if (rows.length < limit) rows = await prisma.newsItem.findMany({ select: SELECT, orderBy: { publishedAt: 'desc' }, take: 400 });
  const rankable = rows.map((r) => ({ ...r, topics: topicsOf(r.topicsJson) }));
  return rankDigest(rankable, companyType, now, limit).map(toDto);
}

export const PAGE_SIZE = 20;

export async function listNews(opts: { topic?: string; lang?: string; page?: number; pageSize?: number }) {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const page = Math.max(1, opts.page ?? 1);
  const where = {
    ...(opts.topic ? { topicsJson: { contains: `"${opts.topic}"` } } : {}),
    ...(opts.lang ? { lang: opts.lang } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.newsItem.findMany({ where, select: SELECT, orderBy: { publishedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.newsItem.count({ where }),
  ]);
  return { items: rows.map(toDto), page, pageSize, total, hasMore: page * pageSize < total };
}
