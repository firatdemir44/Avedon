import { FIBER_INDEX, fiberLabel, isValidFiber } from './fibers';
import { findTerms, tokenize } from './normalize';

// Kompozisyon: serbest metin ↔ yapılandırılmış lif listesi.
// Kabul edilen yazımlar (testte 30+ örnek):
//   "%95 Pamuk %5 Elastan" · "95% Cotton 5% Elastane" · "95/5 CO/EA" ·
//   "92 pes 8 ea" · "100% Cotton" · "Pamuk %95, Elastan %5" · "%100 PES" ·
//   "50 pamuk 50 polyester" · "co 95 ea 5"
// Hiçbir oran tahmin edilmez; tek lif ve hiç sayı yoksa 100 varsayılır
// (düşük güvenle).

export interface CompositionItem {
  fiber: string;
  percent: number;
}

export interface ParsedComposition {
  items: CompositionItem[];
  total: number;
  // 1: tüm lifler tanındı ve toplam 100 · 0.8: toplam 98-102 · 0.5: kısmi ·
  // 0: hiçbir lif bulunamadı
  confidence: number;
  // Tanınmayan kelimeler (Fırat'ın sözlüğe ekleyeceği adaylar)
  unknown: string[];
}

interface NumberToken {
  value: number;
  index: number;
}

// "%95", "95%", "95", "95.5", "95,5" → sayı; "30/1" gibi iplik yazımını almaz.
function readNumbers(tokens: string[]): NumberToken[] {
  const out: NumberToken[] = [];
  tokens.forEach((t, index) => {
    const m = t.match(/^%?(\d{1,3}(?:[.,]\d+)?)%?$/);
    if (!m) return;
    const value = Number(m[1].replace(',', '.'));
    if (value > 0 && value <= 100) out.push({ value, index });
  });
  return out;
}

export function parseComposition(text: string): ParsedComposition {
  const tokens = tokenize(text);
  const rawMatches = findTerms(tokens.join(' '), FIBER_INDEX, { allowAbbreviations: true });
  // "Merino Yün", "Organik Pamuk" gibi yan yana aynı life giden iki eşleşme tek
  // terimdir; ikisine ayrı oran aranmaz.
  const fiberMatches = rawMatches.reduce<typeof rawMatches>((acc, m) => {
    const prev = acc[acc.length - 1];
    if (prev && prev.key === m.key && prev.start + prev.length === m.start) {
      acc[acc.length - 1] = { ...prev, length: prev.length + m.length, matchedText: `${prev.matchedText} ${m.matchedText}`, confidence: Math.max(prev.confidence, m.confidence) };
      return acc;
    }
    acc.push(m);
    return acc;
  }, []);
  const numbers = readNumbers(tokens);

  if (fiberMatches.length === 0) {
    return { items: [], total: 0, confidence: 0, unknown: tokens.filter((t) => !/^%?\d/.test(t) && t !== '/') };
  }

  const usedNumbers = new Set<number>();
  const items: CompositionItem[] = [];

  // Her lif için en yakın kullanılmamış sayı: önce hemen önündeki, sonra
  // hemen arkasındaki; "95/5 CO/EA" gibi ayrık listelerde sıra eşlemesi.
  const orderedNumbers = numbers.filter((n) => !usedNumbers.has(n.index));
  const listForm =
    numbers.length === fiberMatches.length &&
    numbers.every((n) => fiberMatches.every((f) => n.index < f.start || n.index >= f.start + f.length)) &&
    numbers.every((n, i) => (i === 0 ? true : n.index === numbers[i - 1].index + 1 || tokens[n.index - 1] === '/'));

  if (listForm && orderedNumbers.length === fiberMatches.length) {
    // "95/5 CO/EA" ya da "95 5 pamuk elastan": sıra sırasına
    const sortedFibers = [...fiberMatches].sort((a, b) => a.start - b.start);
    orderedNumbers.forEach((n, i) => {
      items.push({ fiber: sortedFibers[i].key, percent: n.value });
      usedNumbers.add(n.index);
    });
  } else {
    for (const f of fiberMatches) {
      const before = numbers.find((n) => !usedNumbers.has(n.index) && n.index === f.start - 1);
      const after = numbers.find((n) => !usedNumbers.has(n.index) && n.index === f.start + f.length);
      // "Pamuk %95" (arkadan) ve "%95 Pamuk" (önden) ikisi de geçerli; önce
      // yakın olan, ikisi de varsa önce gelen.
      const pick = before ?? after;
      if (pick) {
        usedNumbers.add(pick.index);
        items.push({ fiber: f.key, percent: pick.value });
      } else {
        items.push({ fiber: f.key, percent: NaN });
      }
    }
  }

  // Sayısı olmayan tek lif → %100 (düşük güven). Birden fazla lif sayısızsa
  // oranlar bilinmiyor: bu satırlar düşürülür, güven düşer.
  let lowConfidence = false;
  const withPercent = items.filter((i) => !Number.isNaN(i.percent));
  if (withPercent.length === 0 && items.length === 1) {
    items[0].percent = 100;
    lowConfidence = true;
  } else if (withPercent.length < items.length) {
    lowConfidence = true;
    for (let i = items.length - 1; i >= 0; i--) if (Number.isNaN(items[i].percent)) items.splice(i, 1);
  }

  // Aynı lif iki kez yazılmışsa (nadir) toplanır.
  const merged = new Map<string, number>();
  for (const item of items) merged.set(item.fiber, (merged.get(item.fiber) ?? 0) + item.percent);
  const finalItems = [...merged.entries()].map(([fiber, percent]) => ({ fiber, percent: Math.round(percent * 100) / 100 }));
  const total = Math.round(finalItems.reduce((s, i) => s + i.percent, 0) * 100) / 100;

  const matchedIdx = new Set<number>();
  for (const f of fiberMatches) for (let i = f.start; i < f.start + f.length; i++) matchedIdx.add(i);
  const unknown = tokens.filter(
    (t, i) => !matchedIdx.has(i) && !numbers.some((n) => n.index === i) && t !== '/' && t !== '%' && !/^\d/.test(t)
  );

  let confidence: number;
  if (total === 100 && !lowConfidence && unknown.length === 0) confidence = 1;
  else if (total >= 98 && total <= 102 && !lowConfidence) confidence = 0.8;
  else if (finalItems.length > 0) confidence = 0.5;
  else confidence = 0;
  if (fiberMatches.some((f) => f.confidence < 1) && confidence === 1) confidence = 0.9;

  return { items: finalItems, total, confidence, unknown };
}

// Dizi → "%95 Pamuk %5 Elastan" (oran büyükten küçüğe).
export function formatComposition(items: readonly CompositionItem[]) {
  return [...items]
    .sort((a, b) => b.percent - a.percent)
    .map((i) => `%${formatPercent(i.percent)} ${fiberLabel(i.fiber)}`)
    .join(' ');
}

function formatPercent(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
}

export function compositionTotal(items: readonly CompositionItem[]) {
  return Math.round(items.reduce((s, i) => s + i.percent, 0) * 100) / 100;
}

export function validateCompositionItems(items: readonly CompositionItem[]): string[] {
  const problems: string[] = [];
  for (const item of items) {
    if (!isValidFiber(item.fiber)) problems.push(`unknown_fiber:${item.fiber}`);
    if (!(item.percent > 0 && item.percent <= 100)) problems.push(`invalid_percent:${item.fiber}`);
  }
  const total = compositionTotal(items);
  if (items.length > 0 && total !== 100) problems.push(`composition_total_${total}`);
  return problems;
}
