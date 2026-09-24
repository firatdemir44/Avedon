import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PRICE_CURRENCIES } from './catalog';
import { isValidCertificate, isValidFiber } from './domain/glossary';
import { toTex, type YarnCountSystem } from './domain/glossary/units';
import { certificateSchema, compositionItemSchema, MAX_CERTIFICATES, MAX_COMPOSITION_ROWS } from './passport';
import { MAX_PRODUCT_IMAGES } from './validation';

// İplik dizini (Faz 2, Adım 6). Alanlar Fırat'ın 2026-09-18 kararlarıyla:
// kullanım yeri önemli; Uster/mukavemet yok; üretici de tüccar da girer; ana alanlar
// lif ailesine göre ayrılır; fantezi ayrı, elastan/gipe fantezi DEĞİL ayrı alan;
// ana sorgular: numara (denye), filament, iplik çeşidi.
export const YARN_PRODUCT_TYPE = 'iplik';

type Option = { key: string; label: string };
const keysOf = (list: readonly Option[]) => list.map((o) => o.key) as [string, ...string[]];

export const YARN_FAMILIES = [
  { key: 'pamuk', label: 'Pamuk' },
  { key: 'viskon', label: 'Viskon / Rejenere (modal, liyosel)' },
  { key: 'polyester', label: 'Polyester' },
  { key: 'naylon', label: 'Naylon (poliamid)' },
  { key: 'akrilik', label: 'Akrilik' },
  { key: 'yun', label: 'Yün' },
  { key: 'keten', label: 'Keten' },
  { key: 'karisim', label: 'Özel karışım' },
  { key: 'fantezi', label: 'Fantezi (şönil, buklet, lüreks...)' },
  { key: 'elastan_gipe', label: 'Elastan / Gipe' },
  { key: 'diger', label: 'Diğer' },
] as const satisfies readonly Option[];

export const YARN_COUNT_UNITS = [
  { key: 'ne', label: 'Ne' },
  { key: 'nm', label: 'Nm' },
  { key: 'denye', label: 'Denye' },
  { key: 'dtex', label: 'dtex' },
  { key: 'tex', label: 'tex' },
] as const satisfies readonly Option[];

export const YARN_SPINNINGS = [
  { key: 'ring', label: 'Ring' },
  { key: 'kompakt', label: 'Kompakt' },
  { key: 'open_end', label: 'Open End' },
  { key: 'vortex', label: 'Vortex' },
  { key: 'siro', label: 'Siro' },
] as const satisfies readonly Option[];

export const YARN_COMBINGS = [
  { key: 'penye', label: 'Penye' },
  { key: 'karde', label: 'Karde' },
] as const satisfies readonly Option[];

export const YARN_FILAMENT_TYPES = [
  { key: 'dty', label: 'DTY (tekstüre)' },
  { key: 'fdy', label: 'FDY' },
  { key: 'poy', label: 'POY' },
  { key: 'aty', label: 'ATY (hava tekstüre)' },
  { key: 'bcf', label: 'BCF' },
  { key: 'mono', label: 'Monofilament' },
] as const satisfies readonly Option[];

export const YARN_LUSTERS = [
  { key: 'parlak', label: 'Parlak' },
  { key: 'yari_mat', label: 'Yarı mat' },
  { key: 'mat', label: 'Mat' },
] as const satisfies readonly Option[];

// Kullanım yeri (Fırat: "bazı iplikler triko, bazıları örme, dokuma, raşel/çözgülü örgü").
export const YARN_END_USES = [
  { key: 'yuvarlak_orme', label: 'Yuvarlak örme' },
  { key: 'triko', label: 'Triko (düz örme)' },
  { key: 'dokuma_cozgu', label: 'Dokuma - çözgü' },
  { key: 'dokuma_atki', label: 'Dokuma - atkı' },
  { key: 'raschel', label: 'Raşel / çözgülü örme' },
  { key: 'corap', label: 'Çorap' },
  { key: 'dar_dokuma', label: 'Dar dokuma / etiket' },
  { key: 'dikis_nakis', label: 'Dikiş / nakış' },
  { key: 'hali', label: 'Halı' },
] as const satisfies readonly Option[];

export const YARN_COLOR_STATES = [
  { key: 'ham', label: 'Ham' },
  { key: 'boyali', label: 'Boyalı (bobin boya)' },
  { key: 'melanj', label: 'Melanj' },
  { key: 'elyaf_boyali', label: 'Elyaf boyalı' },
  { key: 'dope_dyed', label: 'Dope dyed (çözelti boyalı)' },
] as const satisfies readonly Option[];

export const YARN_SELLER_ROLES = [
  { key: 'uretici', label: 'Üreticiyiz' },
  { key: 'tuccar', label: 'Tüccarız (stoktan satış)' },
] as const satisfies readonly Option[];

export const YARN_OPTIONS = {
  families: YARN_FAMILIES,
  countUnits: YARN_COUNT_UNITS,
  spinnings: YARN_SPINNINGS,
  combings: YARN_COMBINGS,
  filamentTypes: YARN_FILAMENT_TYPES,
  lusters: YARN_LUSTERS,
  endUses: YARN_END_USES,
  colorStates: YARN_COLOR_STATES,
  sellerRoles: YARN_SELLER_ROLES,
};

const END_USE_KEYS = new Set<string>(YARN_END_USES.map((o) => o.key));
const optionalKey = (list: readonly Option[]) => z.union([z.literal(''), z.enum(keysOf(list))]);

// Tek katın dtex karşılığı (30/1 Ne ≈ 197 dtex; 150 denye ≈ 167 dtex).
export function countToDtex(count: number, unit: string) {
  return toTex(count, unit as YarnCountSystem) * 10;
}

const MAX_IMAGE_CHARS = 700_000;
const imageDataUrl = z.string().startsWith('data:image/').max(MAX_IMAGE_CHARS);
const imageItem = z.union([imageDataUrl, z.object({ existing: z.number().int().min(0).max(MAX_PRODUCT_IMAGES - 1) }).strict()]);

const specShape = {
  family: z.enum(keysOf(YARN_FAMILIES)),
  count: z.number().positive().max(100000),
  countUnit: z.enum(keysOf(YARN_COUNT_UNITS)),
  ply: z.number().int().min(1).max(12),
  filaments: z.number().int().positive().max(5000).nullable(),
  spinning: optionalKey(YARN_SPINNINGS),
  combing: optionalKey(YARN_COMBINGS),
  filamentType: optionalKey(YARN_FILAMENT_TYPES),
  luster: optionalKey(YARN_LUSTERS),
  twistDirection: z.enum(['', 'S', 'Z']),
  twistTpm: z.number().positive().max(10000).nullable(),
  endUses: z.array(z.enum(keysOf(YARN_END_USES))).max(YARN_END_USES.length),
  colorState: optionalKey(YARN_COLOR_STATES),
  color: z.string().trim().max(60),
  variety: z.string().trim().max(120),
  origin: z.string().trim().max(60),
  brand: z.string().trim().max(60),
  coneWeightKg: z.number().positive().max(100).nullable(),
  sellerRole: optionalKey(YARN_SELLER_ROLES),
};

const commonShape = {
  code: z.string().trim().min(1).max(40),
  // İplik stoğu kg'dır.
  stock: z.number().nonnegative().max(100_000_000),
  composition: z.array(compositionItemSchema).max(MAX_COMPOSITION_ROWS),
  certificates: z.array(certificateSchema).max(MAX_CERTIFICATES),
  note: z.string().trim().max(500),
  moq: z.number().positive().nullable(),
  leadTimeDays: z.number().int().min(0).max(365).nullable(),
  priceValue: z.number().positive().nullable(),
  priceCurrency: z.union([z.literal(''), z.enum(PRICE_CURRENCIES)]),
};

export const createYarnSchema = z
  .object({
    code: commonShape.code,
    stock: commonShape.stock.default(0),
    family: specShape.family,
    count: specShape.count,
    countUnit: specShape.countUnit,
    ply: specShape.ply.default(1),
    filaments: specShape.filaments.optional(),
    spinning: specShape.spinning.default(''),
    combing: specShape.combing.default(''),
    filamentType: specShape.filamentType.default(''),
    luster: specShape.luster.default(''),
    twistDirection: specShape.twistDirection.default(''),
    twistTpm: specShape.twistTpm.optional(),
    endUses: specShape.endUses.default([]),
    colorState: specShape.colorState.default(''),
    color: specShape.color.default(''),
    variety: specShape.variety.default(''),
    origin: specShape.origin.default(''),
    brand: specShape.brand.default(''),
    coneWeightKg: specShape.coneWeightKg.optional(),
    sellerRole: specShape.sellerRole.default(''),
    composition: commonShape.composition.default([]),
    certificates: commonShape.certificates.default([]),
    note: commonShape.note.default(''),
    moq: commonShape.moq.optional(),
    leadTimeDays: commonShape.leadTimeDays.optional(),
    priceValue: commonShape.priceValue.optional(),
    priceCurrency: commonShape.priceCurrency.default(''),
    images: z.array(imageDataUrl).max(MAX_PRODUCT_IMAGES).default([]),
  })
  .strict();

export const updateYarnSchema = z
  .object({
    ...Object.fromEntries(Object.entries({ ...specShape, ...commonShape }).map(([k, v]) => [k, v.optional()])),
    images: z.array(imageItem).max(MAX_PRODUCT_IMAGES).optional(),
  })
  .strict() as z.ZodType<Partial<z.infer<typeof createYarnSchema>> & { images?: Array<string | { existing: number }> }>;

export function compositionTotalError(rows: { percent: number }[]) {
  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + r.percent, 0);
  return Math.abs(total - 100) > 0.5 ? 'composition_total_not_100' : null;
}

const LABEL = (list: readonly Option[], key: string) => list.find((o) => o.key === key)?.label ?? key;
const UNIT_LABEL: Record<string, string> = { ne: 'Ne', nm: 'Nm', denye: 'denye', dtex: 'dtex', tex: 'tex' };
const trimNum = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

// "30/1 Ne" · "150/48 denye" (filamentli) · "40/2 Ne"
export function yarnCountLabel(s: { count: number; countUnit: string; ply: number; filaments: number | null }) {
  const unit = UNIT_LABEL[s.countUnit] ?? s.countUnit;
  if (s.filaments) return `${trimNum(s.count)}/${s.filaments} ${unit}${s.ply > 1 ? ` x${s.ply}` : ''}`;
  return `${trimNum(s.count)}/${s.ply} ${unit}`;
}

// Product.content'e yazılan tek satır özet: genel arama ve eski ekranlar için.
export function yarnSummary(s: {
  family: string;
  count: number;
  countUnit: string;
  ply: number;
  filaments: number | null;
  spinning: string;
  combing: string;
  filamentType: string;
  variety: string;
}) {
  return [
    yarnCountLabel(s),
    s.combing && LABEL(YARN_COMBINGS, s.combing),
    s.spinning && LABEL(YARN_SPINNINGS, s.spinning),
    s.filamentType && s.filamentType.toUpperCase(),
    LABEL(YARN_FAMILIES, s.family).split(' (')[0].split(' /')[0],
    s.variety,
  ]
    .filter(Boolean)
    .join(' ');
}

export const YARN_SPEC_SELECT = {
  family: true,
  count: true,
  countUnit: true,
  ply: true,
  countDtex: true,
  filaments: true,
  spinning: true,
  combing: true,
  filamentType: true,
  luster: true,
  twistDirection: true,
  twistTpm: true,
  endUses: true,
  colorState: true,
  color: true,
  variety: true,
  origin: true,
  brand: true,
  coneWeightKg: true,
  sellerRole: true,
} satisfies Prisma.YarnSpecSelect;

type SpecRow = Prisma.YarnSpecGetPayload<{ select: typeof YARN_SPEC_SELECT }>;

export function parseEndUses(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string' && END_USE_KEYS.has(k)) : [];
  } catch {
    return [];
  }
}

export function toYarnSpecRow(spec: SpecRow | null | undefined) {
  if (!spec) return null;
  const { endUses, countDtex, ...rest } = spec;
  return { ...rest, countDtex: Math.round(countDtex * 10) / 10, endUses: parseEndUses(endUses), countLabel: yarnCountLabel(spec), summary: yarnSummary(spec) };
}

const num = z.coerce.number().positive().optional();

export const yarnQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  family: z.string().max(200).optional(),
  // Numara: birimle birlikte tek değer (±%4 tolerans) ya da aralık.
  count: num,
  countMin: num,
  countMax: num,
  countUnit: z.enum(keysOf(YARN_COUNT_UNITS)).optional(),
  ply: z.coerce.number().int().min(1).max(12).optional(),
  filaments: z.coerce.number().int().positive().optional(),
  filamentType: z.string().max(100).optional(),
  spinning: z.string().max(100).optional(),
  combing: z.enum(keysOf(YARN_COMBINGS)).optional(),
  luster: z.enum(keysOf(YARN_LUSTERS)).optional(),
  endUse: z.string().max(200).optional(),
  colorState: z.string().max(100).optional(),
  fiber: z.string().max(300).optional(),
  certificate: z.string().max(300).optional(),
  sellerRole: z.enum(keysOf(YARN_SELLER_ROLES)).optional(),
  inStock: z.enum(['1', 'true']).optional(),
  companyId: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).max(5000).optional(),
});
export type YarnQuery = z.infer<typeof yarnQuerySchema>;

const COUNT_TOLERANCE = 0.04;
const list = (raw: string | undefined, valid: readonly Option[]) => {
  const keys = new Set(valid.map((o) => o.key));
  return (raw ?? '').split(',').filter((k) => keys.has(k));
};

export function buildYarnWhere(q: YarnQuery, opts: { includeOutOfStock?: boolean } = {}): Prisma.ProductWhereInput {
  const spec: Prisma.YarnSpecWhereInput[] = [];
  const and: Prisma.ProductWhereInput[] = [{ type: YARN_PRODUCT_TYPE }];
  // Stoksuz iplik yalnızca kendi ekibine (bkz. products.ts IN_STOCK).
  if (!opts.includeOutOfStock) and.push({ stock: { gt: 0 } });

  const families = list(q.family, YARN_FAMILIES);
  if (families.length) spec.push({ family: { in: families } });

  // Birim verilmezse değer kayıtlı birimiyle birebir karşılaştırılır; verilirse dtex'e
  // çevrilir ki "150 denye" araması "167 dtex" girilmiş ipliği de bulsun.
  if (q.countUnit) {
    const dtexOf = (v: number) => countToDtex(v, q.countUnit!);
    if (q.count !== undefined) {
      const d = dtexOf(q.count);
      spec.push({ countDtex: { gte: d * (1 - COUNT_TOLERANCE), lte: d * (1 + COUNT_TOLERANCE) } });
    }
    if (q.countMin !== undefined || q.countMax !== undefined) {
      // Dolaylı sistemlerde (Ne, Nm) büyük numara = ince iplik = küçük dtex: uçlar yer değiştirir.
      const ends = [q.countMin, q.countMax].map((v) => (v === undefined ? undefined : dtexOf(v)));
      const defined = ends.filter((v): v is number => v !== undefined);
      const indirect = q.countUnit === 'ne' || q.countUnit === 'nm';
      const lo = indirect ? ends[1] : ends[0];
      const hi = indirect ? ends[0] : ends[1];
      if (defined.length) spec.push({ countDtex: { ...(lo !== undefined ? { gte: lo * 0.999 } : {}), ...(hi !== undefined ? { lte: hi * 1.001 } : {}) } });
    }
  } else {
    if (q.count !== undefined) spec.push({ count: q.count });
    if (q.countMin !== undefined) spec.push({ count: { gte: q.countMin } });
    if (q.countMax !== undefined) spec.push({ count: { lte: q.countMax } });
  }
  if (q.ply) spec.push({ ply: q.ply });
  if (q.filaments) spec.push({ filaments: q.filaments });
  const filamentTypes = list(q.filamentType, YARN_FILAMENT_TYPES);
  if (filamentTypes.length) spec.push({ filamentType: { in: filamentTypes } });
  const spinnings = list(q.spinning, YARN_SPINNINGS);
  if (spinnings.length) spec.push({ spinning: { in: spinnings } });
  if (q.combing) spec.push({ combing: q.combing });
  if (q.luster) spec.push({ luster: q.luster });
  const endUses = list(q.endUse, YARN_END_USES);
  if (endUses.length) spec.push({ OR: endUses.map((k) => ({ endUses: { contains: `"${k}"` } })) });
  const colorStates = list(q.colorState, YARN_COLOR_STATES);
  if (colorStates.length) spec.push({ colorState: { in: colorStates } });
  if (q.sellerRole) spec.push({ sellerRole: q.sellerRole });
  if (spec.length) and.push({ yarnSpec: { AND: spec } });

  if (q.fiber) {
    const fibers = q.fiber.split(',').filter(isValidFiber);
    if (fibers.length) and.push({ compositions: { some: { fiber: { in: fibers } } } });
  }
  if (q.certificate) {
    const names = q.certificate.split(',').filter(isValidCertificate);
    if (names.length) and.push({ certificates: { some: { name: { in: names } } } });
  }
  if (q.inStock) and.push({ stock: { gt: 0 } });
  if (q.companyId) and.push({ companyId: q.companyId });
  if (q.search) {
    const s = q.search;
    and.push({
      OR: [
        { code: { contains: s } },
        { content: { contains: s } },
        { useArea: { contains: s } },
        { company: { name: { contains: s } } },
        { yarnSpec: { OR: [{ variety: { contains: s } }, { brand: { contains: s } }, { color: { contains: s } }] } },
      ],
    });
  }
  return { AND: and };
}
