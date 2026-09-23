import type { Prisma } from '@prisma/client';
import { fold } from '../domain/glossary/normalize';
import { rangeMatch } from './range';

// Genel aramada "Fason makine" grubu: serbest metinden makine türü ve ölçüleri
// ayıklanır. Örn. "raschel 28 fine" → Raschel, fayn 28; "yuvarlak 30 inç 24 fayn".
// Türkçe büyük/küçük harf ve ı/i farkı `fold` ile giderilir (IŞIK → isik).

export type MachineTypeKey = 'yuvarlak' | 'raschel' | 'duz_orme' | 'dokuma';

// Tür anahtarı → görünen ad ve eşleşme kuralı. Makine türü serbest metin
// (kindKey = fold(kind)); tür, kindKey içindeki sözcüklerden ya da gruptan çıkar.
export const MACHINE_TYPES: { key: MachineTypeKey; label: string; words: string[]; kindContains?: string[]; group?: string }[] = [
  { key: 'yuvarlak', label: 'Yuvarlak örme', words: ['yuvarlak', 'circular', 'suprem', 'ribana', 'interlok'], kindContains: ['yuvarlak'] },
  { key: 'raschel', label: 'Raschel', words: ['raschel', 'rasel', 'rashel', 'rachel'], kindContains: ['raschel', 'rasel'] },
  { key: 'duz_orme', label: 'Düz örme', words: ['duz', 'flat', 'triko'], kindContains: ['duz orme'] },
  { key: 'dokuma', label: 'Dokuma', words: ['dokuma', 'tezgah', 'weaving', 'rapier', 'rapierli'], group: 'dokuma' },
];

const GAUGE_UNITS = new Set(['fine', 'fayn', 'gg', 'gauge', 'e']);
const DIAMETER_UNITS = new Set(['inc', 'inch', 'pus', 'in', '"']);
const AVAILABLE_WORDS = new Set(['musait', 'bos', 'available']);
const FEEDER_UNITS = new Set(['sistem', 'system', 'feeder']);

export interface MachineQuery {
  types: MachineTypeKey[];
  gauge: number | null;
  diameterInch: number | null;
  feeders: number | null;
  /** Birimsiz sayılar: fayn ya da pus olabilir. */
  bare: number[];
  /** 'müsait' geçtiyse yalnızca bugün boş olan makineler. */
  availableOnly: boolean;
}

export function parseMachineQuery(input: string): MachineQuery | null {
  // "28fine", "30\"" gibi bitişik yazımlar ayrılır.
  const text = fold(input.replace(/"/g, ' inc ')).replace(/(\d)([a-z])/g, '$1 $2');
  const tokens = text.split(/\s+/).filter(Boolean);
  const result: MachineQuery = { types: [], gauge: null, diameterInch: null, feeders: null, bare: [], availableOnly: false };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (AVAILABLE_WORDS.has(token)) {
      result.availableOnly = true;
      continue;
    }
    const type = MACHINE_TYPES.find((t) => t.words.includes(token));
    if (type) {
      // "düz" tek başına belirsiz; "düz örme" ya da örme bağlamı gerekmez, yine de
      // "duz dikis" gibi kalıplarda yanlış eşleşmesin diye sonraki sözcüğe bakılır.
      if (type.key === 'duz_orme' && token === 'duz' && tokens[i + 1] && tokens[i + 1] !== 'orme') continue;
      if (!result.types.includes(type.key)) result.types.push(type.key);
      continue;
    }
    // "28-22" gibi aralık: ilk sayı alınır (dönüştürülebilir makine).
    const rangeHead = /^(\d+(?:[.,]\d+)?)[-/]\d+(?:[.,]\d+)?$/.exec(token);
    const n = rangeHead
      ? Number(rangeHead[1].replace(',', '.'))
      : /^\d+([.,]\d+)?$/.test(token)
        ? Number(token.replace(',', '.'))
        : NaN;
    if (Number.isNaN(n) || n <= 0) continue;
    const next = tokens[i + 1];
    if (next && GAUGE_UNITS.has(next)) {
      result.gauge = n;
      i++;
    } else if (next && DIAMETER_UNITS.has(next)) {
      result.diameterInch = n;
      i++;
    } else if (next && FEEDER_UNITS.has(next)) {
      result.feeders = n;
      i++;
    } else if (n <= 100) {
      result.bare.push(n);
    }
  }
  const hasUnit = result.gauge != null || result.diameterInch != null || result.feeders != null;
  // Makine araması yalnızca bir tür sözcüğü ya da birimli bir ölçü varsa yapılır;
  // "Bursa" ya da "30/1" gibi aramalar makine grubunu boşuna doldurmaz.
  if (!result.types.length && !hasUnit && !result.availableOnly) return null;
  return result;
}

export function buildMachineWhere(q: MachineQuery, now = new Date()): Prisma.MachineWhereInput {
  const and: Prisma.MachineWhereInput[] = [];
  if (q.availableOnly) and.push({ OR: [{ busyUntil: null }, { busyUntil: { lte: now } }] });
  if (q.types.length) {
    and.push({
      OR: q.types.flatMap((key) => {
        const def = MACHINE_TYPES.find((t) => t.key === key)!;
        return [
          ...(def.kindContains ?? []).map((c) => ({ kindKey: { contains: c } })),
          ...(def.group ? [{ group: def.group }] : []),
        ];
      }),
    });
  }
  // Fine aralıklı olabilir ("28-22"): sayısal alan ya da aralığın herhangi bir parçası.
  if (q.gauge != null) and.push(rangeMatch('gauge', 'gaugeText', q.gauge));
  if (q.diameterInch != null) and.push({ diameterInch: q.diameterInch });
  if (q.feeders != null) and.push({ feeders: q.feeders });
  // Birimsiz sayı: fayn ya da pus tutsun.
  for (const n of q.bare) {
    and.push({ OR: [...(rangeMatch('gauge', 'gaugeText', n).OR as Prisma.MachineWhereInput[]), { diameterInch: n }] });
  }
  return { AND: and };
}

// Kayıttaki serbest türden görünen tür adı (mobil `machineTypeLabel` ile aynı kural).
export function machineTypeLabel(m: { kind: string; group: string }): string {
  const key = fold(m.kind);
  for (const t of MACHINE_TYPES) {
    if (t.kindContains?.some((c) => key.includes(c))) return t.label;
  }
  if (m.group === 'dokuma') return 'Dokuma';
  return m.kind;
}
