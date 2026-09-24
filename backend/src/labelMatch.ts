import { FIBER_INDEX, findTerms, fiberLabel, isValidFiber, tokenize, type CompositionItem } from './domain/glossary';

// Etiketle benzer kumaş arama: mağazadaki kıyafetin içerik etiketi (ör. "%92 PES %8 EA")
// ile katalogdaki ürünlerin kompozisyonu karşılaştırılır. Saf fonksiyonlar; testi labelMatch.test.ts.

export const MIN_LABEL_OVERLAP = 50;
export const MAX_COMPOSITION_BONUS = 30;
export const ELASTANE_MISMATCH_PENALTY = 10;

const ABBR: Record<string, string> = {
  pamuk: 'CO', polyester: 'PES', elastan: 'EA', viskon: 'CV', poliamid: 'PA', yun: 'WO', akrilik: 'PAN', keten: 'LI',
  modal: 'MD', lyocell: 'CLY', ipek: 'SE', bambu: 'Bambu', polipropilen: 'PP', kasmir: 'WS', metalik: 'ME', diger: 'Diğer',
};

// Lif anahtarını sözlükle normalleştirir ("Elastane", "EA" → "elastan"); tanınmazsa küçük harfli hali.
export function normalizeFiberKey(raw: string): string {
  const key = raw.trim().toLocaleLowerCase('tr');
  if (isValidFiber(key)) return key;
  const hit = findTerms(tokenize(raw).join(' '), FIBER_INDEX, { allowAbbreviations: true })[0];
  return hit ? hit.key : key;
}

// Aynı lif birden çok satırdaysa toplanır.
export function fiberMap(items: readonly CompositionItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const i of items) {
    if (!(i.percent > 0)) continue;
    const k = normalizeFiberKey(i.fiber);
    map.set(k, (map.get(k) ?? 0) + i.percent);
  }
  return map;
}

// Σ min(pctA, pctB), 0–100. Biri boşsa 0.
export function compositionOverlap(a: readonly CompositionItem[], b: readonly CompositionItem[]): number {
  const ma = fiberMap(a);
  const mb = fiberMap(b);
  let sum = 0;
  for (const [k, pa] of ma) sum += Math.min(pa, mb.get(k) ?? 0);
  return Math.max(0, Math.min(100, Math.round(sum)));
}

export const hasElastane = (items: readonly CompositionItem[]) => (fiberMap(items).get('elastan') ?? 0) > 0;

const fmtPct = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10).replace('.', ','));

// "%92 PES %8 EA"
export function shortComposition(items: readonly CompositionItem[]): string {
  return [...fiberMap(items)].sort((x, y) => y[1] - x[1]).map(([k, p]) => `%${fmtPct(p)} ${ABBR[k] ?? fiberLabel(k)}`).join(' ');
}

export function labelFibers(items: readonly CompositionItem[]) {
  return [...fiberMap(items)].sort((x, y) => y[1] - x[1]).map(([key, percent]) => ({ key, label: fiberLabel(key), percent }));
}

export function overlapReason(overlap: number, label: readonly CompositionItem[]) {
  return `İçerik %${overlap} uyumlu (etiket: ${shortComposition(label)})`;
}

export interface LabelCandidate {
  id: string;
  composition: CompositionItem[];
  stock: number;
  createdAt: Date;
  // Fotoğraf da verildiyse görünüm puanı (MIN_LOOK_SCORE üstü adaylar); yoksa undefined.
  lookScore?: number;
  reasons: string[];
}

export interface RankedLabelCandidate<T extends LabelCandidate> {
  item: T;
  overlap: number;
  total: number;
  reasons: string[];
}

// Etiket verildiğinde sıralama. Fotoğraf varsa: görünüm puanı + içerik bonusu (en çok +30)
// − elastan var/yok farkında 10. Yalnız etiket: uyum → stoktaki önce → en yeni.
// Uyumu 50'nin altındakiler atılır; hiçbiri kalmıyorsa tutulur ve uyarı döner.
export function rankWithLabel<T extends LabelCandidate>(candidates: readonly T[], label: readonly CompositionItem[]) {
  const labelElastane = hasElastane(label);
  const withPhoto = candidates.some((c) => c.lookScore !== undefined);
  const scored: RankedLabelCandidate<T>[] = candidates.map((c) => {
    const overlap = c.composition.length ? compositionOverlap(label, c.composition) : 0;
    const reasons = [...c.reasons];
    if (c.composition.length) reasons.push(overlapReason(overlap, label));
    let total = overlap;
    if (c.lookScore !== undefined) {
      total = c.lookScore + (MAX_COMPOSITION_BONUS * overlap) / 100;
      if (c.composition.length && hasElastane(c.composition) !== labelElastane) {
        total -= ELASTANE_MISMATCH_PENALTY;
        reasons.push(labelElastane ? 'etikette elastan var, bu üründe yok' : 'bu üründe elastan var, etikette yok');
      }
    }
    return { item: c, overlap, total, reasons };
  });
  const strong = scored.filter((s) => s.overlap >= MIN_LABEL_OVERLAP);
  const weakOnly = strong.length === 0 && scored.length > 0;
  const kept = weakOnly ? scored : strong;
  const stockOf = (s: RankedLabelCandidate<T>) => Number((s.item.stock ?? 0) > 0);
  kept.sort((a, b) =>
    withPhoto
      ? b.total - a.total
      : b.overlap - a.overlap || stockOf(b) - stockOf(a) || b.item.createdAt.getTime() - a.item.createdAt.getTime()
  );
  const warnings = weakOnly ? ['İçeriği etiketle yeterince uyan ürün bulunamadı; en yakın sonuçlar gösteriliyor.'] : [];
  return { ranked: kept, warnings };
}
