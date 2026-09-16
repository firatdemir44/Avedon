import { fold } from './normalize';

// Birim katmanı (Faz 1, Adım 1). İplik numarası çevrimleri
// mobile/src/features/calculators/formulas.ts ile BİREBİR aynı (aynı 1,693
// sabiti); Adım 4'te backend hesap motorları buradan içe alacak.

// Dolaylı sistemler (Ne, Nm): sayı büyüdükçe iplik incelir.
// Doğrudan sistemler (tex, dtex, denye): sayı büyüdükçe iplik kalınlaşır.
export type YarnCountSystem = 'ne' | 'nm' | 'tex' | 'dtex' | 'denye';
export const YARN_COUNT_SYSTEMS: readonly YarnCountSystem[] = ['ne', 'nm', 'tex', 'dtex', 'denye'];

const NE_TO_NM_FACTOR = 1.693;

export interface YarnCountResult {
  tex: number;
  dtex: number;
  nm: number;
  ne: number;
  denye: number;
}

export function toTex(value: number, system: YarnCountSystem): number {
  switch (system) {
    case 'tex':
      return value;
    case 'dtex':
      return value / 10;
    case 'nm':
      return 1000 / value;
    case 'ne':
      return 1000 / (value * NE_TO_NM_FACTOR);
    case 'denye':
      return value / 9;
  }
}

export function fromTex(tex: number): YarnCountResult {
  const nm = 1000 / tex;
  return { tex, dtex: tex * 10, nm, ne: nm / NE_TO_NM_FACTOR, denye: tex * 9 };
}

// Katlı iplikte (60/2 Ne) sonuç ipliğin kalınlığı: tek katın tex'i × kat sayısı.
export function convertYarnCount(value: number, system: YarnCountSystem, ply = 1): YarnCountResult {
  return fromTex(toTex(value, system) * Math.max(1, ply));
}

// ---------------------------------------------------------------------------
// Gramaj / en / metretül
// ---------------------------------------------------------------------------

// 1 metre kumaşın ağırlığı (g): gramaj × en(m). Kilogram başına metre bunun tersi.
export function gramsPerMeter(gsm: number, widthCm: number) {
  return gsm * (widthCm / 100);
}

export function metersPerKg(gsm: number, widthCm: number) {
  const g = gramsPerMeter(gsm, widthCm);
  return g > 0 ? 1000 / g : 0;
}

export function metersToKg(meters: number, gsm: number, widthCm: number) {
  return (meters * gramsPerMeter(gsm, widthCm)) / 1000;
}

export function kgToMeters(kg: number, gsm: number, widthCm: number) {
  return kg * metersPerKg(gsm, widthCm);
}

// ---------------------------------------------------------------------------
// Birimli metin ayrıştırma
// ---------------------------------------------------------------------------

export type WidthType = 'acik' | 'tup';
export const WIDTH_TYPES = ['acik', 'tup'] as const;
export const WIDTH_TYPE_LABELS: Record<WidthType, string> = { acik: 'Açık en', tup: 'Tüp en' };

export interface ParsedYarn {
  count: number;
  unit: YarnCountSystem;
  ply: number;
  // DTY, FDY gibi tip metinde geçiyorsa (ham, sözlükten geçmemiş).
  yarnType: string | null;
  matchedText: string;
}

export interface ParsedMeasures {
  gsm: number | null;
  widthCm: number | null;
  widthType: WidthType | null;
  yarns: ParsedYarn[];
}

const number = (s: string) => Number(s.replace(',', '.'));

// "220 gsm", "220 gr/m2", "220 g/m²", "220gr", "gramaj 220"
const GSM_PATTERNS = [
  /(\d+(?:[.,]\d+)?)\s*(?:gsm|g\s*\/\s*m2|gr\s*\/\s*m2|g\/m|gr\/m|gr|gram(?:aj)?)\b/,
  /gramaj[:\s]+(\d+(?:[.,]\d+)?)/,
];

// "180 cm", "180cm", "en 180", "en: 180 cm"
const WIDTH_PATTERNS = [/(\d+(?:[.,]\d+)?)\s*cm\b/, /\ben[:\s]+(\d+(?:[.,]\d+)?)/];

// "30/1 ne", "ne 30/1", "30/1", "150 denye", "150d dty", "75 dtex", "nm 50", "40 tex"
const YARN_PATTERNS: { re: RegExp; unit: YarnCountSystem | 'infer'; countIdx: number; plyIdx?: number }[] = [
  { re: /(\d+(?:[.,]\d+)?)\s*\/\s*(\d)\s*(?:ne|nm)?\b/, unit: 'infer', countIdx: 1, plyIdx: 2 },
  { re: /\bne\s*(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d))?/, unit: 'ne', countIdx: 1, plyIdx: 2 },
  { re: /\bnm\s*(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d))?/, unit: 'nm', countIdx: 1, plyIdx: 2 },
  { re: /(\d+(?:[.,]\d+)?)\s*(?:denye|denier|den|d)\b/, unit: 'denye', countIdx: 1 },
  { re: /(\d+(?:[.,]\d+)?)\s*dtex\b/, unit: 'dtex', countIdx: 1 },
  { re: /(\d+(?:[.,]\d+)?)\s*tex\b/, unit: 'tex', countIdx: 1 },
];

const YARN_TYPE_RE = /\b(dty|fdy|poy|ring|open end|openend|oe|kompakt|compact|penye|karde|vortex)\b/;

export function parseWidthType(text: string): WidthType | null {
  const f = fold(text);
  if (/\b(tup|tubular|tube|boru)\b/.test(f)) return 'tup';
  if (/\b(acik en|acik|open width|open)\b/.test(f)) return 'acik';
  return null;
}

// Tek bir metinden gramaj, en, en tipi ve iplik bilgilerini çeker. Bulamadığı
// alan null kalır; hiçbir değer tahmin edilmez.
export function parseMeasures(text: string): ParsedMeasures {
  const f = fold(text);
  // Gramaj ve en olarak okunan metin parçaları; aynı parça iplik sanılmasın
  // ("220 gr" → 220 denye değil). Farklı yerdeki aynı sayı ("150 cm" ve
  // "150 denye") ise iki ayrı alandır.
  const spans: [number, number][] = [];
  let gsm: number | null = null;
  for (const re of GSM_PATTERNS) {
    const m = f.match(re);
    if (m && m.index !== undefined) {
      gsm = number(m[1]);
      spans.push([m.index, m.index + m[0].length]);
      break;
    }
  }
  let widthCm: number | null = null;
  for (const re of WIDTH_PATTERNS) {
    const m = f.match(re);
    if (m && m.index !== undefined) {
      widthCm = number(m[1]);
      spans.push([m.index, m.index + m[0].length]);
      break;
    }
  }
  const overlaps = (start: number, end: number) => spans.some(([a, b]) => start < b && end > a);
  const yarns: ParsedYarn[] = [];
  const yarnSpans: [number, number][] = [];
  const overlapsYarn = (start: number, end: number) => yarnSpans.some(([a, b]) => start < b && end > a);
  for (const { re, unit, countIdx, plyIdx } of YARN_PATTERNS) {
    const global = new RegExp(re.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = global.exec(f))) {
      const spanEnd = m.index + m[0].length;
      if (overlapsYarn(m.index, spanEnd)) continue;
      const count = number(m[countIdx]);
      // "30/1" biçimi "%95/5" kompozisyon oranıyla çakışabilir: başında % ya da
      // sonrasında lif kısaltması varsa iplik sayılmaz.
      if (unit === 'infer') {
        const before = f[m.index - 1];
        const after = f.slice(m.index + m[0].length, m.index + m[0].length + 4);
        if (before === '%' || /^\s*[a-z]{2,3}\s*\//.test(after)) continue;
        // Yalnızca "30/1", "20/1", "60/2" gibi 1-3 kat ve makul sayılar
        const ply = Number(m[plyIdx ?? 0]);
        if (!(ply >= 1 && ply <= 3) || count > 200) continue;
      }
      if (overlaps(m.index, spanEnd)) continue;
      // "Nm 50/2": birim adı sayının hemen önünde de yazılabiliyor.
      const lead = f.slice(Math.max(0, m.index - 4), m.index);
      const inferredUnit: YarnCountSystem =
        unit === 'infer' ? (/\bnm\b/.test(m[0]) || /\bnm\s*$/.test(lead) ? 'nm' : 'ne') : unit;
      const spanStart = /\b(nm|ne)\s*$/.test(lead) ? m.index - lead.match(/\b(nm|ne)\s*$/)![0].length : m.index;
      yarnSpans.push([spanStart, spanEnd]);
      const typeMatch = f.slice(m.index, m.index + m[0].length + 12).match(YARN_TYPE_RE);
      yarns.push({
        count,
        unit: inferredUnit,
        ply: plyIdx && m[plyIdx] ? Number(m[plyIdx]) : 1,
        yarnType: typeMatch ? typeMatch[1] : null,
        matchedText: m[0].trim(),
      });
    }
  }
  return { gsm, widthCm, widthType: parseWidthType(text), yarns };
}
