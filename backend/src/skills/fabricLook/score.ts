import type { FabricLook } from './schema';

// Görünüm benzerliği: açıklanabilir, deterministik puan (0-100) + nedenler.
// Ağırlıklar: desen 30, renk 25, doku 20, yüzey 10, şeffaflık 10, ölçek 5.
const NEAR_COLORS: [string, string][] = [
  ['beyaz', 'ekru'],
  ['ekru', 'bej'],
  ['bej', 'kahverengi'],
  ['kirmizi', 'bordo'],
  ['kirmizi', 'turuncu'],
  ['sari', 'turuncu'],
  ['pembe', 'mor'],
  ['pembe', 'kirmizi'],
  ['lacivert', 'mavi'],
  ['mavi', 'turkuaz'],
  ['turkuaz', 'yesil'],
  ['yesil', 'haki'],
  ['haki', 'kahverengi'],
  ['gri', 'antrasit'],
  ['antrasit', 'siyah'],
  ['lacivert', 'siyah'],
  ['metalik', 'gri'],
];
const NEAR_TEXTURES: [string, string][] = [
  ['file', 'tul'],
  ['tul', 'dantel'],
  ['file', 'dantel'],
  ['petek', 'kabartma'],
  ['ribli', 'kalin_orgu'],
  ['havlu', 'kalin_orgu'],
];
const inPairs = (pairs: [string, string][], a: string, b: string) => pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

const SURFACE_ORDER = ['mat', 'hafif_parlak', 'parlak'];
const TRANSPARENCY_ORDER = ['opak', 'yari_saydam', 'saydam'];
const SCALE_ORDER = ['kucuk', 'orta', 'buyuk'];

function stepScore(order: string[], a: string, b: string, full: number) {
  if (a === b) return full;
  const i = order.indexOf(a);
  const j = order.indexOf(b);
  return i >= 0 && j >= 0 && Math.abs(i - j) === 1 ? full / 2 : 0;
}

export interface LookScore {
  score: number;
  reasons: string[];
}

export function scoreLooks(query: FabricLook, candidate: FabricLook): LookScore {
  const reasons: string[] = [];
  let score = 0;

  if (query.pattern === candidate.pattern) {
    score += 30;
    reasons.push(query.pattern === 'duz' ? 'ikisi de düz' : 'aynı desen türü');
  } else if (query.pattern !== 'duz' && candidate.pattern !== 'duz') {
    score += 8; // ikisi de desenli ama türü farklı
  }

  const [qMain, ...qRest] = query.colors;
  const [cMain, ...cRest] = candidate.colors;
  if (qMain && cMain) {
    if (qMain === cMain) {
      score += 15;
      reasons.push('aynı ana renk');
    } else if (inPairs(NEAR_COLORS, qMain, cMain)) {
      score += 8;
      reasons.push('yakın ana renk');
    } else if (candidate.colors.includes(qMain) || query.colors.includes(cMain)) {
      score += 5;
    }
    const overlap = qRest.filter((c) => cRest.includes(c) || c === cMain).length;
    const maxRest = Math.max(qRest.length, cRest.length);
    score += maxRest === 0 ? 10 : Math.round((10 * overlap) / maxRest);
  }

  if (query.texture === candidate.texture) {
    score += 20;
    if (query.texture !== 'duz') reasons.push('aynı doku');
  } else if (inPairs(NEAR_TEXTURES, query.texture, candidate.texture)) {
    score += 10;
    reasons.push('yakın doku');
  }

  const surface = query.surface === candidate.surface ? 10 : stepScore(SURFACE_ORDER, query.surface, candidate.surface, 10);
  score += surface;
  if (surface === 10 && query.surface !== 'mat') reasons.push('aynı yüzey');

  const transparency = stepScore(TRANSPARENCY_ORDER, query.transparency, candidate.transparency, 10);
  score += transparency;
  if (transparency === 10 && query.transparency !== 'opak') reasons.push('aynı şeffaflık');

  if (query.pattern !== 'duz' && candidate.pattern !== 'duz') score += stepScore(SCALE_ORDER, query.scale, candidate.scale, 5);
  else if (query.pattern === 'duz' && candidate.pattern === 'duz') score += 5;

  return { score: Math.round(score), reasons };
}
