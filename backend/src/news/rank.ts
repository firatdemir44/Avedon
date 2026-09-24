// Sektör gündemi: firma türüne göre kişiselleştirilmiş sıralama.
import type { TopicKey } from './topics';

export const PREFERRED_TOPICS: Record<string, TopicKey[]> = {
  iplik: ['hammadde', 'fiyat', 'makine'],
  kumas_uretici: ['hammadde', 'makine', 'ihracat', 'fuar'],
  konfeksiyon: ['moda', 'fuar', 'ihracat', 'fiyat'],
  boyahane: ['surdurulebilirlik', 'makine', 'hammadde'],
  aksesuar: ['moda', 'fuar'],
  baski: ['moda', 'makine'],
  toptanci: ['fiyat', 'ihracat', 'moda'],
};

export type RankableItem = { source: string; lang: string; title: string; topics: string[]; publishedAt: Date };

const HOUR = 60 * 60 * 1000;

export function scoreItem(item: RankableItem, companyType: string, now: Date, uiLang = 'tr'): number {
  const pref = PREFERRED_TOPICS[companyType];
  let score = 0;
  if (pref) {
    const matches = item.topics.filter((t) => pref.includes(t as TopicKey)).length;
    score += Math.min(matches, 2) * 3;
  } else if (!item.topics.includes('is_dunyasi')) {
    score += 1; // tür yoksa: konusu belli haber biraz önde
  }
  const ageH = Math.max(0, (now.getTime() - item.publishedAt.getTime()) / HOUR);
  if (ageH <= 48) score += 1 + 4 * (1 - ageH / 48); // son 48 saat: +1..+5
  score -= Math.min(ageH / 24, 30) * 0.15; // eski haber yavaşça geriler
  if (item.lang === uiLang) score += 1; // Türkçe arayüzde Türkçe kaynak hafif önde
  return score;
}

// Skora göre sıralar; seçilenler içinde bir kaynaktan en fazla `perSource` haber, aynı başlık bir kez.
export function rankDigest<T extends RankableItem>(items: T[], companyType: string, now: Date, limit = 5, perSource = 2): T[] {
  const sorted = items
    .map((it) => ({ it, s: scoreItem(it, companyType, now) }))
    .sort((a, b) => b.s - a.s || b.it.publishedAt.getTime() - a.it.publishedAt.getTime())
    .map((x) => x.it);
  const picked: T[] = [];
  const count = new Map<string, number>();
  const seen = new Set<string>();
  for (const it of sorted) {
    if (picked.length >= limit) break;
    const key = it.title.toLocaleLowerCase('tr-TR').slice(0, 80);
    if (seen.has(key)) continue;
    const n = count.get(it.source) ?? 0;
    if (n >= perSource) continue;
    seen.add(key);
    count.set(it.source, n + 1);
    picked.push(it);
  }
  // Çeşitlilik yüzünden eksik kaldıysa kalanlarla doldur.
  for (const it of sorted) {
    if (picked.length >= limit) break;
    const key = it.title.toLocaleLowerCase('tr-TR').slice(0, 80);
    if (!picked.includes(it) && !seen.has(key)) {
      seen.add(key);
      picked.push(it);
    }
  }
  return picked;
}
