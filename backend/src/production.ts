import { z } from 'zod';
import { CERTIFICATES as GLOSSARY_CERTIFICATES } from './domain/glossary/certificates';
import { TARGET_COUNTRIES } from './export/countries';

// Konfeksiyon / fason atölye üretim kabiliyeti (docs/konfeksiyon-plani.md Bölüm A).
// Anahtar saklanır, etiket gösterilir; etiketler İngilizce istekte i18n/en/labels.ts ile çevrilir.

// Üretim sekmesi olan firma türleri.
export const PRODUCTION_COMPANY_TYPES = ['konfeksiyon', 'fason_atolye'] as const;
export const hasProductionTab = (companyType: string) => (PRODUCTION_COMPANY_TYPES as readonly string[]).includes(companyType);

export const PRODUCT_GROUPS = [
  { key: 'ic_camasiri', label: 'İç çamaşırı' },
  { key: 'sutyen', label: 'Sütyen / korse' },
  { key: 'mayo', label: 'Mayo / bikini' },
  { key: 'tisort', label: 'Tişört / basic' },
  { key: 'sweatshirt', label: 'Sweatshirt / eşofman' },
  { key: 'aktif_spor', label: 'Aktif spor giyim' },
  { key: 'tayt', label: 'Tayt' },
  { key: 'pijama', label: 'Pijama / ev giyim' },
  { key: 'cocuk', label: 'Çocuk / bebek' },
  { key: 'gomlek', label: 'Gömlek' },
  { key: 'pantolon', label: 'Pantolon / denim' },
  { key: 'dis_giyim', label: 'Dış giyim / mont' },
  { key: 'abiye', label: 'Abiye / elbise' },
  { key: 'triko', label: 'Triko' },
  { key: 'diger', label: 'Diğer' },
] as const;

export const SERVICES = [
  { key: 'kesim', label: 'Kesim' },
  { key: 'dikim', label: 'Dikim' },
  { key: 'baski', label: 'Baskı' },
  { key: 'nakis', label: 'Nakış' },
  { key: 'yikama', label: 'Yıkama' },
  { key: 'utu_paket', label: 'Ütü / paket' },
  { key: 'modelhane', label: 'Modelhane' },
] as const;

// Yalnız fason atölye.
export const OPERATIONS = [
  { key: 'kesim', label: 'Kesim' },
  { key: 'dikim', label: 'Dikim' },
  { key: 'overlok_recme', label: 'Overlok / reçme' },
  { key: 'utu_paket', label: 'Ütü / paket' },
  { key: 'kalite_kontrol', label: 'Kalite kontrol' },
] as const;

export const WORK_MODES = [
  { key: 'fason', label: 'Fason' },
  { key: 'koleksiyon', label: 'Kendi koleksiyonu' },
  { key: 'ikisi', label: 'İkisi de' },
] as const;

export const FABRIC_MODES = [
  { key: 'sadece_dikim', label: 'Sadece dikim' },
  { key: 'tam_paket', label: 'Tam paket (kumaş dahil)' },
  { key: 'ikisi', label: 'İkisi de' },
] as const;

export const EMPLOYEE_RANGES = [
  { key: '1-10', label: '1-10 kişi' },
  { key: '11-50', label: '11-50 kişi' },
  { key: '51-200', label: '51-200 kişi' },
  { key: '201-500', label: '201-500 kişi' },
  { key: '500+', label: '500+ kişi' },
] as const;

// Kumaş pasaportundaki sertifika sözlüğüyle aynı anahtarlar; konfeksiyonda sık istenen
// sosyal uygunluk denetimleri (BSCI, SEDEX) eklendi.
const glossaryLabel = (key: string) => GLOSSARY_CERTIFICATES.find((c) => c.key === key)!.label;
export const CERTIFICATES = [
  { key: 'oeko_tex_100', label: glossaryLabel('oeko_tex_100') },
  { key: 'gots', label: glossaryLabel('gots') },
  { key: 'grs', label: glossaryLabel('grs') },
  { key: 'bsci', label: 'amfori BSCI' },
  { key: 'sedex', label: 'SEDEX (SMETA)' },
  { key: 'iso_9001', label: glossaryLabel('iso_9001') },
  { key: 'diger', label: glossaryLabel('diger') },
] as const;

export const MAX_MAIN_GROUPS = 3;
export const MAX_PRODUCTION_REFERENCES = 12;
// Firma fotoğraflarıyla aynı sınır (bkz. companyPhotos.ts).
export const MAX_REFERENCE_IMAGE_CHARS = 700_000;
const MAX_QUANTITY = 100_000_000;
const MAX_DAYS = 365;

const keysOf = (list: readonly { key: string }[]) => list.map((o) => o.key) as [string, ...string[]];
const COUNTRY_CODES = TARGET_COUNTRIES.map((c) => c.iso2) as [string, ...string[]];

const uniqueList = <T extends z.ZodTypeAny>(item: T, max: number) =>
  z
    .array(item)
    .max(max)
    .refine((arr) => new Set(arr.map((x) => (typeof x === 'object' ? JSON.stringify(x) : x))).size === arr.length, 'duplicate');

const quantity = z.number().int().min(0).max(MAX_QUANTITY).nullable();
const days = z.number().int().min(0).max(MAX_DAYS).nullable();

export const productionSchema = z
  .object({
    productGroups: uniqueList(z.enum(keysOf(PRODUCT_GROUPS)), PRODUCT_GROUPS.length),
    mainGroups: uniqueList(z.enum(keysOf(PRODUCT_GROUPS)), MAX_MAIN_GROUPS),
    groupsOther: z.string().trim().max(200),
    workMode: z.union([z.literal(''), z.enum(keysOf(WORK_MODES))]),
    monthlyCapacity: quantity,
    capacityByGroup: z.record(z.enum(keysOf(PRODUCT_GROUPS)), z.number().int().min(0).max(MAX_QUANTITY)),
    moqPerModel: quantity,
    moqPerColor: quantity,
    sampleLeadDays: days,
    productionLeadDays: days,
    services: uniqueList(z.enum(keysOf(SERVICES)), SERVICES.length),
    operations: uniqueList(z.enum(keysOf(OPERATIONS)), OPERATIONS.length),
    fabricMode: z.union([z.literal(''), z.enum(keysOf(FABRIC_MODES))]),
    certificates: z
      .array(z.object({ key: z.enum(keysOf(CERTIFICATES)), docPosition: z.number().int().min(0).max(11).nullable().optional() }).strict())
      .max(CERTIFICATES.length)
      .refine((arr) => new Set(arr.map((c) => c.key)).size === arr.length, 'duplicate'),
    exportCountries: uniqueList(z.enum(COUNTRY_CODES), COUNTRY_CODES.length),
    employeeRange: z.union([z.literal(''), z.enum(keysOf(EMPLOYEE_RANGES))]),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.mainGroups.some((g) => !v.productGroups.includes(g))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mainGroups'], message: 'main_not_in_groups' });
    }
    if (Object.keys(v.capacityByGroup).some((g) => !v.productGroups.includes(g))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['capacityByGroup'], message: 'group_not_selected' });
    }
  });

export type ProductionInput = z.infer<typeof productionSchema>;

export const referenceSchema = z
  .object({
    imageUrl: z.string().startsWith('data:image/').max(MAX_REFERENCE_IMAGE_CHARS),
    caption: z.string().trim().max(200).default(''),
    clientName: z.string().trim().max(120).default(''),
    showClient: z.boolean().default(false),
    permissionConfirmed: z.boolean(),
  })
  .strict();

export type ReferenceCheck =
  | { ok: true; data: z.infer<typeof referenceSchema> }
  | { ok: false; error: 'invalid_body' | 'permission_required'; details?: unknown };

// Paylaşma izni işaretlenmeden referans görseli kabul edilmez (Bölüm A, madde 2).
export function checkReference(body: unknown): ReferenceCheck {
  const parsed = referenceSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: 'invalid_body', details: parsed.error.flatten() };
  if (parsed.data.permissionConfirmed !== true) return { ok: false, error: 'permission_required' };
  // Müşteri adı yoksa gösterilecek bir şey de yok.
  const data = { ...parsed.data, showClient: parsed.data.showClient && parsed.data.clientName !== '' };
  return { ok: true, data };
}

// İlk boş sıra (silme sonrası boşluklar doldurulur); dolu ise null.
export function nextFreePosition(used: number[]): number | null {
  const set = new Set(used);
  for (let i = 0; i < MAX_PRODUCTION_REFERENCES; i++) if (!set.has(i)) return i;
  return null;
}

const parseJson = <T>(text: string, fallback: T): T => {
  try {
    const v = JSON.parse(text);
    return v ?? fallback;
  } catch {
    return fallback;
  }
};

type ProductionRow = {
  productGroups: string;
  mainGroups: string;
  groupsOther: string;
  workMode: string;
  monthlyCapacity: number | null;
  capacityByGroup: string;
  moqPerModel: number | null;
  moqPerColor: number | null;
  sampleLeadDays: number | null;
  productionLeadDays: number | null;
  services: string;
  operations: string;
  fabricMode: string;
  certificates: string;
  exportCountries: string;
  employeeRange: string;
  updatedAt?: Date;
};

export const EMPTY_PRODUCTION: ProductionInput = {
  productGroups: [],
  mainGroups: [],
  groupsOther: '',
  workMode: '',
  monthlyCapacity: null,
  capacityByGroup: {},
  moqPerModel: null,
  moqPerColor: null,
  sampleLeadDays: null,
  productionLeadDays: null,
  services: [],
  operations: [],
  fabricMode: '',
  certificates: [],
  exportCountries: [],
  employeeRange: '',
};

// Veritabanı satırı → yanıt. Sertifika "belgeli": docPosition mevcut bir Belgeler fotoğrafını gösteriyor.
export function toProductionView(row: ProductionRow | null, certificatePhotoPositions: number[]) {
  const docs = new Set(certificatePhotoPositions);
  if (!row) return { ...EMPTY_PRODUCTION, certificates: [], updatedAt: null };
  const certs = parseJson<{ key: string; docPosition?: number | null }[]>(row.certificates, []);
  return {
    productGroups: parseJson<string[]>(row.productGroups, []),
    mainGroups: parseJson<string[]>(row.mainGroups, []),
    groupsOther: row.groupsOther,
    workMode: row.workMode,
    monthlyCapacity: row.monthlyCapacity,
    capacityByGroup: parseJson<Record<string, number>>(row.capacityByGroup, {}),
    moqPerModel: row.moqPerModel,
    moqPerColor: row.moqPerColor,
    sampleLeadDays: row.sampleLeadDays,
    productionLeadDays: row.productionLeadDays,
    services: parseJson<string[]>(row.services, []),
    operations: parseJson<string[]>(row.operations, []),
    fabricMode: row.fabricMode,
    certificates: certs.map((c) => ({
      key: c.key,
      docPosition: c.docPosition ?? null,
      documented: typeof c.docPosition === 'number' && docs.has(c.docPosition),
    })),
    exportCountries: parseJson<string[]>(row.exportCountries, []),
    employeeRange: row.employeeRange,
    updatedAt: row.updatedAt ?? null,
  };
}

// Doğrulanmış giriş → veritabanı alanları (JSON metin).
export function toProductionData(v: ProductionInput) {
  return {
    productGroups: JSON.stringify(v.productGroups),
    mainGroups: JSON.stringify(v.mainGroups),
    groupsOther: v.groupsOther,
    workMode: v.workMode,
    monthlyCapacity: v.monthlyCapacity,
    capacityByGroup: JSON.stringify(v.capacityByGroup),
    moqPerModel: v.moqPerModel,
    moqPerColor: v.moqPerColor,
    sampleLeadDays: v.sampleLeadDays,
    productionLeadDays: v.productionLeadDays,
    services: JSON.stringify(v.services),
    operations: JSON.stringify(v.operations),
    fabricMode: v.fabricMode,
    certificates: JSON.stringify(v.certificates.map((c) => (c.docPosition == null ? { key: c.key } : c))),
    exportCountries: JSON.stringify(v.exportCountries),
    employeeRange: v.employeeRange,
  };
}

export function productionOptions(lang: string | undefined) {
  return {
    productGroups: PRODUCT_GROUPS,
    services: SERVICES,
    operations: OPERATIONS,
    workModes: WORK_MODES,
    fabricModes: FABRIC_MODES,
    employeeRanges: EMPLOYEE_RANGES,
    certificates: CERTIFICATES,
    countries: TARGET_COUNTRIES.map((c) => ({ key: c.iso2, name: lang === 'en' ? c.nameEn : c.name })),
    maxMainGroups: MAX_MAIN_GROUPS,
    maxReferences: MAX_PRODUCTION_REFERENCES,
  };
}
