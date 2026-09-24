import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { normalizeCareSymbols, parseCareSymbols } from './domain/care';
import {
  FINISH_TAG_KEYS,
  FINISH_TAGS,
  PRICE_CURRENCIES,
  STOCK_UNITS,
  YARN_ROLE_KEYS,
  YARN_TYPE_KEYS,
  YARN_UNIT_KEYS,
  type ProductType,
} from './catalog';
import {
  WIDTH_TYPES,
  checkPassport,
  formatComposition,
  isValidCertificate,
  isValidFiber,
  parseComposition,
  validateCompositionItems,
  type CompositionItem,
} from './domain/glossary';

// Kumaş pasaportu (Faz 1, Adım 2): doğrulama şemaları, alt tabloları baştan
// yazma, yanıt biçimi, fiyat süzme ve makullük uyarıları. Ürün rotası
// (routes/products.ts) bu dosyayı kullanır; Adım 3 çıkarım servisi de aynı
// şemayla kayıt yapar.

export const MAX_COMPOSITION_ROWS = 6;
export const MAX_YARNS = 6;
export const MAX_CERTIFICATES = 10;
export const MAX_TEST_REPORTS = 10;
// Ürün fotoğrafıyla aynı sınır (validation.ts).
const MAX_DOC_IMAGE_CHARS = 700_000;
// Sertifika/test raporu belgesi PDF de olabilir (Fırat 2026-09-22; Textile Exchange gibi belgeler PDF gelir).
// Belge ~1,5 MB'a kadar (base64 ile ~2 MB).
const MAX_DOC_PDF_CHARS = 2_100_000;

// Ayrıştırılan kompozisyonun kayda YAZILMASI için gereken güven. Altı: metin
// düz kalır, kullanıcı formda satırlara kendisi böler.
export const COMPOSITION_AUTOPARSE_MIN_CONFIDENCE = 0.9;

const docImage = z.union([
  z.string().startsWith('data:image/').max(MAX_DOC_IMAGE_CHARS),
  z.string().startsWith('data:application/pdf;base64,').max(MAX_DOC_PDF_CHARS),
]);
// Belge fotoğrafı: yeni data URL · { existing: eskiSıra } (mevcut korunur) · null (yok)
const docImageInput = z.union([docImage, z.object({ existing: z.number().int().min(0).max(19) }).strict()]).nullable();

const inKeys = (keys: Set<string>, message: string) => z.string().trim().refine((v) => keys.has(v), { message });

export const compositionItemSchema = z
  .object({
    fiber: z.string().trim().refine(isValidFiber, { message: 'unknown_fiber' }),
    percent: z.number().positive().max(100),
  })
  .strict();

export const yarnSchema = z
  .object({
    role: z.union([z.literal(''), inKeys(YARN_ROLE_KEYS, 'unknown_yarn_role')]).default(''),
    count: z.number().positive(),
    unit: inKeys(YARN_UNIT_KEYS, 'unknown_yarn_unit'),
    ply: z.number().int().min(1).max(6).default(1),
    yarnType: z.union([z.literal(''), inKeys(YARN_TYPE_KEYS, 'unknown_yarn_type')]).default(''),
  })
  .strict();

export const certificateSchema = z
  .object({
    name: z.string().trim().refine(isValidCertificate, { message: 'unknown_certificate' }),
    number: z.string().trim().max(80).default(''),
    validUntil: z.coerce.date().nullable().optional(),
    image: docImageInput.optional(),
  })
  .strict();

export const testReportSchema = z
  .object({
    kind: z.string().trim().min(1).max(80),
    result: z.string().trim().max(200).default(''),
    testedAt: z.coerce.date().nullable().optional(),
    image: docImageInput.optional(),
  })
  .strict();

export const FIELD_META_SOURCES = ['manual', 'parsed_content', 'extracted', 'whatsapp', 'web', 'file'] as const;

// İstemci hangi alanların çıkarımdan geldiğini bildirir (Adım 3); onaylananlar
// confirmed: true. Elle girilen alanlar için satır gönderilmez.
export const fieldMetaSchema = z
  .object({
    field: z.string().trim().min(1).max(40),
    confidence: z.number().min(0).max(1),
    source: z.enum(FIELD_META_SOURCES),
    confirmed: z.boolean().default(false),
  })
  .strict();

const stockUnitOrEmpty = z.union([z.literal(''), z.enum(STOCK_UNITS)]);

// Oluşturma ve güncellemede ortak; hepsi isteğe bağlı.
export const passportFieldsSchema = z.object({
  composition: z.array(compositionItemSchema).max(MAX_COMPOSITION_ROWS).optional(),
  yarns: z.array(yarnSchema).max(MAX_YARNS).optional(),
  certificates: z.array(certificateSchema).max(MAX_CERTIFICATES).optional(),
  testReports: z.array(testReportSchema).max(MAX_TEST_REPORTS).optional(),
  widthType: z.union([z.literal(''), z.enum(WIDTH_TYPES)]).optional(),
  widthMeaning: z.union([z.literal(''), z.enum(['acik', 'tup_tek_yuz'])]).optional(),
  // MOQ ve birimi stok biriminden bağımsız (kullanıcı kararı 2026-09-16); null temizler.
  moq: z.number().positive().nullable().optional(),
  moqUnit: stockUnitOrEmpty.optional(),
  leadTimeDays: z.number().int().min(0).max(365).nullable().optional(),
  // Fiyat yalnızca sahibine döner; null temizler.
  priceValue: z.number().nonnegative().nullable().optional(),
  priceCurrency: z.union([z.literal(''), z.enum(PRICE_CURRENCIES)]).optional(),
  priceUnit: stockUnitOrEmpty.optional(),
  finishTags: z.array(inKeys(FINISH_TAG_KEYS, 'unknown_finish_tag')).max(FINISH_TAGS.length).optional(),
  // AB Dijital Ürün Pasaportu'na hazırlık (Faz 3, Adım 7): menşe, bakım, geri dönüştürülmüş içerik.
  originCountry: z.string().trim().max(60).optional(),
  careNotes: z.string().trim().max(500).optional(),
  // Bakım sembolleri (Fırat 2026-09-21): yazı yerine etiket sembolleri; grup başına en çok bir tane.
  careSymbols: z.array(z.string().max(30)).max(5).optional(),
  recycledPercent: z.number().min(0).max(100).nullable().optional(),
  fieldMeta: z.array(fieldMetaSchema).max(40).optional(),
});

export type PassportFields = z.infer<typeof passportFieldsSchema>;

// ---------------------------------------------------------------------------
// Seçimler ve yanıt biçimi
// ---------------------------------------------------------------------------

// Liste ve detay için ortak hafif seçim: kompozisyon (en fazla 6 satır) ve
// sertifika adları yanıta girer; iplik, test raporu ve belge fotoğrafları girmez.
export const PASSPORT_LIST_SELECT = {
  widthType: true,
  widthMeaning: true,
  moq: true,
  moqUnit: true,
  leadTimeDays: true,
  priceValue: true,
  priceCurrency: true,
  priceUnit: true,
  finishTags: true,
  passportUpdatedAt: true,
  originCountry: true,
  careNotes: true,
  careSymbols: true,
  recycledPercent: true,
  compositions: { select: { fiber: true, percent: true }, orderBy: { position: 'asc' } },
  certificates: { select: { name: true }, orderBy: { position: 'asc' } },
} satisfies Prisma.ProductSelect;

export const PASSPORT_DETAIL_SELECT = {
  ...PASSPORT_LIST_SELECT,
  yarns: {
    select: { position: true, role: true, count: true, unit: true, ply: true, yarnType: true },
    orderBy: { position: 'asc' },
  },
  certificates: {
    select: { position: true, name: true, number: true, validUntil: true },
    orderBy: { position: 'asc' },
  },
  testReports: {
    select: { position: true, kind: true, result: true, testedAt: true },
    orderBy: { position: 'asc' },
  },
  fieldMeta: { select: { field: true, confidence: true, source: true, confirmedAt: true } },
} satisfies Prisma.ProductSelect;

type PassportListRow = Prisma.ProductGetPayload<{ select: typeof PASSPORT_LIST_SELECT }>;

export function parseFinishTags(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((k): k is string => typeof k === 'string' && FINISH_TAG_KEYS.has(k)) : [];
  } catch {
    return [];
  }
}

// Pasaportun yanıt biçimi. Fiyat alanları yalnızca ürünün sahibi firmaya
// verilir; başka herkes için hiç yazılmaz (null bile değil).
export function toPassportRow(
  row: PassportListRow,
  options: { viewerCompanyId?: string | null; ownerCompanyId: string; pendingFieldCount?: number }
) {
  const { priceValue, priceCurrency, priceUnit, finishTags, careSymbols, compositions, certificates, ...rest } = row;
  const isOwner = !!options.viewerCompanyId && options.viewerCompanyId === options.ownerCompanyId;
  return {
    ...rest,
    finishTags: parseFinishTags(finishTags),
    careSymbols: parseCareSymbols(careSymbols),
    composition: compositions.map((c) => ({ fiber: c.fiber, percent: c.percent })),
    certificateNames: certificates.map((c) => c.name),
    ...(isOwner ? { price: priceValue == null ? null : { value: priceValue, currency: priceCurrency, unit: priceUnit } } : {}),
    pendingFieldCount: options.pendingFieldCount ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Yazma
// ---------------------------------------------------------------------------

export class PassportError extends Error {
  constructor(
    public readonly field: string,
    message: string
  ) {
    super(message);
  }
}

// Belge fotoğrafı öğesini çözer: yeni data URL, mevcut sıradaki fotoğraf ya da yok.
function resolveDocImage(
  input: string | { existing: number } | null | undefined,
  byPosition: Map<number, string | null>,
  field: string
): string | null {
  if (input === undefined || input === null) return null;
  if (typeof input === 'string') return input;
  if (!byPosition.has(input.existing)) throw new PassportError(field, 'unknown_existing_image');
  return byPosition.get(input.existing) ?? null;
}

// Verilen alt tabloları baştan yazar (verilmeyenlere dokunmaz).
export async function replacePassportRelations(
  tx: Prisma.TransactionClient,
  productId: string,
  input: Pick<PassportFields, 'composition' | 'yarns' | 'certificates' | 'testReports'>
) {
  if (input.composition) {
    await tx.productComposition.deleteMany({ where: { productId } });
    if (input.composition.length) {
      await tx.productComposition.createMany({
        data: input.composition.map((c, position) => ({ productId, position, fiber: c.fiber, percent: c.percent })),
      });
    }
  }
  if (input.yarns) {
    await tx.productYarn.deleteMany({ where: { productId } });
    if (input.yarns.length) {
      await tx.productYarn.createMany({
        data: input.yarns.map((y, position) => ({ productId, position, ...y })),
      });
    }
  }
  if (input.certificates) {
    const current = await tx.productCertificate.findMany({ where: { productId }, select: { position: true, imageUrl: true } });
    const byPosition = new Map(current.map((c) => [c.position, c.imageUrl]));
    const rows = input.certificates.map((c, position) => ({
      productId,
      position,
      name: c.name,
      number: c.number,
      validUntil: c.validUntil ?? null,
      imageUrl: resolveDocImage(c.image, byPosition, 'certificates'),
    }));
    await tx.productCertificate.deleteMany({ where: { productId } });
    if (rows.length) await tx.productCertificate.createMany({ data: rows });
  }
  if (input.testReports) {
    const current = await tx.productTestReport.findMany({ where: { productId }, select: { position: true, imageUrl: true } });
    const byPosition = new Map(current.map((c) => [c.position, c.imageUrl]));
    const rows = input.testReports.map((t, position) => ({
      productId,
      position,
      kind: t.kind,
      result: t.result,
      testedAt: t.testedAt ?? null,
      imageUrl: resolveDocImage(t.image, byPosition, 'testReports'),
    }));
    await tx.productTestReport.deleteMany({ where: { productId } });
    if (rows.length) await tx.productTestReport.createMany({ data: rows });
  }
}

// Alan üstverisi: istemcinin bildirdiği satırlar yazılır (var olan güncellenir);
// bildirilmeyen alanlara dokunulmaz.
export async function writeFieldMeta(
  tx: Prisma.TransactionClient,
  productId: string,
  items: NonNullable<PassportFields['fieldMeta']>
) {
  for (const item of items) {
    await tx.productFieldMeta.upsert({
      where: { productId_field: { productId, field: item.field } },
      create: {
        productId,
        field: item.field,
        confidence: item.confidence,
        source: item.source,
        confirmedAt: item.confirmed ? new Date() : null,
      },
      update: { confidence: item.confidence, source: item.source, confirmedAt: item.confirmed ? new Date() : null },
    });
  }
}

// Product sütunlarına giden pasaport alanları (ilişkiler hariç).
// Düz değerler (oluşturma ve güncelleme verisine aynen yayılır).
type PassportColumnData = Partial<
  Pick<
    Prisma.ProductUncheckedCreateInput,
    'widthType' | 'widthMeaning' | 'moq' | 'moqUnit' | 'leadTimeDays' | 'priceValue' | 'priceCurrency' | 'priceUnit' | 'finishTags' | 'originCountry' | 'careNotes' | 'careSymbols' | 'recycledPercent'
  >
>;

export function passportColumns(input: PassportFields): PassportColumnData {
  const data: PassportColumnData = {};
  if (input.widthType !== undefined) data.widthType = input.widthType;
  if (input.widthMeaning !== undefined) data.widthMeaning = input.widthMeaning;
  if (input.moq !== undefined) data.moq = input.moq;
  if (input.moqUnit !== undefined) data.moqUnit = input.moqUnit;
  if (input.leadTimeDays !== undefined) data.leadTimeDays = input.leadTimeDays;
  if (input.priceValue !== undefined) data.priceValue = input.priceValue;
  if (input.priceCurrency !== undefined) data.priceCurrency = input.priceCurrency;
  if (input.priceUnit !== undefined) data.priceUnit = input.priceUnit;
  if (input.finishTags !== undefined) data.finishTags = JSON.stringify([...new Set(input.finishTags)]);
  if (input.originCountry !== undefined) data.originCountry = input.originCountry;
  if (input.careNotes !== undefined) data.careNotes = input.careNotes;
  if (input.careSymbols !== undefined) {
    const normalized = normalizeCareSymbols(input.careSymbols);
    if (!normalized.ok) throw new PassportError('careSymbols', normalized.error);
    data.careSymbols = JSON.stringify(normalized.keys);
  }
  if (input.recycledPercent !== undefined) data.recycledPercent = input.recycledPercent;
  return data;
}

export function hasPassportInput(input: PassportFields) {
  return Object.values(input).some((v) => v !== undefined);
}

// ---------------------------------------------------------------------------
// İçerik metni ↔ kompozisyon
// ---------------------------------------------------------------------------

export interface ContentResolution {
  content: string;
  // undefined: kompozisyona dokunma · []: temizle · dolu: yaz
  composition?: CompositionItem[];
  // Ayrıştırmadan geldiyse üstveri satırı
  fieldMeta?: { field: string; confidence: number; source: 'parsed_content'; confirmed: boolean };
  warnings: string[];
}

// Kompozisyon verildiyse metin ondan üretilir (iki alan çelişemez). Yalnızca
// metin verildiyse ayrıştırılır; güven eşiği üstünde satırlara yazılır ve
// "parsed_content" kaynağıyla işaretlenir; altında metin düz kalır ve
// kompozisyon temizlenir (eski satırlar yeni metinle çelişmesin).
export function resolveContent(input: { content?: string; composition?: CompositionItem[] }): ContentResolution {
  const warnings: string[] = [];
  if (input.composition !== undefined) {
    const problems = validateCompositionItems(input.composition);
    warnings.push(...problems.filter((p) => p.startsWith('composition_total_')));
    return {
      content: input.composition.length ? formatComposition(input.composition) : (input.content ?? ''),
      composition: input.composition,
      warnings,
    };
  }
  if (input.content !== undefined) {
    const parsed = parseComposition(input.content);
    if (parsed.items.length && parsed.confidence >= COMPOSITION_AUTOPARSE_MIN_CONFIDENCE) {
      return {
        content: input.content,
        composition: parsed.items,
        fieldMeta: { field: 'composition', confidence: parsed.confidence, source: 'parsed_content', confirmed: false },
        warnings,
      };
    }
    if (parsed.items.length) warnings.push('composition_unparsed');
    return { content: input.content, composition: [], warnings };
  }
  return { content: '', warnings };
}

// Makullük uyarıları (kaydı engellemez).
export function passportWarnings(input: {
  type: ProductType;
  subtype?: string | null;
  weightGsm?: number | null;
  widthCm?: number | null;
  composition?: readonly CompositionItem[];
}) {
  const report = checkPassport(input);
  return { flags: report.flags, notes: report.notes };
}
