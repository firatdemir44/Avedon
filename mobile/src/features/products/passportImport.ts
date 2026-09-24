// Etiketten çıkarılan pasaport önerisinin onay ekranı ile ürün formu arasındaki
// ortak dili (Faz 1, Adım 3). Onay ekranı seçilen alanları `PassportImport`
// olarak gezinme parametresiyle forma yollar; form değerleri state'ine yazar ve
// `fields` satırlarını kayıtta `fieldMeta` olarak gönderir.
import type {
  ExtractRejected,
  ExtractedCertificate,
  ExtractedYarn,
  ExtractionFieldName,
  PassportExtraction,
} from '../../api/client';
import type { CompositionItem } from '../../types';
import {
  PRODUCT_TYPES,
  SUBTYPES,
  finishTagLabel,
  typeLabel,
  usageLabel,
  yarnTypeLabel,
  yarnUnitLabel,
  type ProductType,
} from './catalog';
import { certificateLabel, formatComposition, widthTypeLabel } from './glossaryLabels';
import { locale } from '../../i18n';
import { trLabels } from '../trLabels';

export const EXTRACTION_FIELDS: readonly ExtractionFieldName[] = [
  'type',
  'subtype',
  'code',
  'composition',
  'weightGsm',
  'widthCm',
  'widthType',
  'yarns',
  'certificates',
  'finishTags',
  'usages',
];

export const FIELD_LABELS: Record<ExtractionFieldName, string> = trLabels({
  type: 'Çeşit',
  subtype: 'Alt çeşit',
  code: 'Ürün kodu',
  composition: 'Kompozisyon',
  weightGsm: 'Gramaj',
  widthCm: 'En',
  widthType: 'En tipi',
  yarns: 'İplik',
  certificates: 'Sertifikalar',
  finishTags: 'Apre / boya',
  usages: 'Kullanım amaçları',
});

export const REJECT_REASON_LABELS: Record<ExtractRejected['reason'], string> = trLabels({
  unknown_fiber: 'Bilinmeyen lif',
  unknown_subtype: 'Bilinmeyen alt çeşit',
  subtype_not_in_type: 'Seçili çeşide ait değil',
  unknown_certificate: 'Bilinmeyen sertifika',
  unknown_yarn_unit: 'Bilinmeyen iplik birimi',
  invalid_value: 'Geçersiz değer',
  low_confidence: 'Güven düşük',
});

// Bu güvenin altındaki alan onay ekranında işaretsiz gelir (kullanıcı isterse
// elle işaretler). Sunucudaki eşikle karıştırılmamalı: sunucu zaten daha
// düşüklerini hiç göndermiyor.
export const AUTO_SELECT_CONFIDENCE = 0.6;
// Bunun üstü "etikette yazıyor" sayılır.
export const CERTAIN_CONFIDENCE = 0.9;

export interface PassportImportValues {
  type?: ProductType;
  subtype?: string;
  code?: string;
  composition?: CompositionItem[];
  weightGsm?: number;
  widthCm?: number;
  widthType?: 'acik' | 'tup';
  yarns?: ExtractedYarn[];
  certificates?: ExtractedCertificate[];
  finishTags?: string[];
  usages?: string[];
}

export interface PassportImport {
  values: PassportImportValues;
  // Aktarılan alanlar ve güvenleri; kayıtta fieldMeta satırına dönüşür.
  fields: { field: ExtractionFieldName; confidence: number }[];
}

// Alt çeşit hangi çeşide ait olursa olsun etiketi bulunur (onay ekranında çeşit
// henüz seçilmemiş olabilir).
export function anySubtypeLabel(key: string) {
  if (!key) return '';
  for (const type of PRODUCT_TYPES) {
    const found = SUBTYPES[type].find((s) => s.key === key);
    if (found) return found.label;
  }
  return key;
}

// "Ne 30/1 Penye (ring)"
export function formatYarn(yarn: ExtractedYarn) {
  const number = yarn.ply > 1 ? `${yarn.count}/${yarn.ply}` : `${yarn.count}/1`;
  const type = yarn.yarnType ? ` ${yarnTypeLabel(yarn.yarnType)}` : '';
  return `${yarnUnitLabel(yarn.unit)} ${number}${type}`;
}

// "OEKO-TEX Standard 100 · 21.0.12345"
export function formatCertificate(certificate: ExtractedCertificate) {
  return certificate.number ? `${certificateLabel(certificate.name)} · ${certificate.number}` : certificateLabel(certificate.name);
}

// Onay ekranındaki okunabilir değer. Değer yoksa boş dize.
export function formatFieldValue(extraction: PassportExtraction, field: ExtractionFieldName): string {
  switch (field) {
    case 'type':
      return extraction.type.value ? typeLabel(extraction.type.value) : '';
    case 'subtype':
      return anySubtypeLabel(extraction.subtype.value ?? '');
    case 'code':
      return extraction.code.value ?? '';
    case 'composition':
      return extraction.composition.value?.length ? formatComposition(extraction.composition.value) : '';
    case 'weightGsm':
      return extraction.weightGsm.value == null ? '' : `${formatNumber(extraction.weightGsm.value)} gr/m²`;
    case 'widthCm':
      return extraction.widthCm.value == null ? '' : `${formatNumber(extraction.widthCm.value)} cm`;
    case 'widthType':
      return extraction.widthType.value ? widthTypeLabel(extraction.widthType.value) : '';
    case 'yarns':
      return extraction.yarns.value?.length ? extraction.yarns.value.map(formatYarn).join(' · ') : '';
    case 'certificates':
      return extraction.certificates.value?.length
        ? extraction.certificates.value.map(formatCertificate).join(' · ')
        : '';
    case 'finishTags':
      return extraction.finishTags.value?.length ? extraction.finishTags.value.map(finishTagLabel).join(', ') : '';
    case 'usages':
      return extraction.usages.value?.length ? extraction.usages.value.map(usageLabel).join(', ') : '';
  }
}

// Sayı: tam sayıysa olduğu gibi, değilse Türkçe ondalık.
function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString(locale(), { maximumFractionDigits: 2 });
}

// Alanda okunmuş bir değer var mı (onay ekranı yalnızca bunları listeler).
export function hasValue(extraction: PassportExtraction, field: ExtractionFieldName): boolean {
  const value = extraction[field].value;
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

// İşaretli alanlardan forma gidecek paketi kurar.
export function buildPassportImport(
  extraction: PassportExtraction,
  selected: readonly ExtractionFieldName[]
): PassportImport {
  const values: PassportImportValues = {};
  const fields: PassportImport['fields'] = [];

  for (const field of selected) {
    if (!hasValue(extraction, field)) continue;
    switch (field) {
      case 'type':
        values.type = extraction.type.value!;
        break;
      case 'subtype':
        values.subtype = extraction.subtype.value!;
        break;
      case 'code':
        values.code = extraction.code.value!;
        break;
      case 'composition':
        values.composition = extraction.composition.value!;
        break;
      case 'weightGsm':
        values.weightGsm = extraction.weightGsm.value!;
        break;
      case 'widthCm':
        values.widthCm = extraction.widthCm.value!;
        break;
      case 'widthType':
        values.widthType = extraction.widthType.value!;
        break;
      case 'yarns':
        values.yarns = extraction.yarns.value!;
        break;
      case 'certificates':
        values.certificates = extraction.certificates.value!;
        break;
      case 'finishTags':
        values.finishTags = extraction.finishTags.value!;
        break;
      case 'usages':
        values.usages = extraction.usages.value!;
        break;
    }
    fields.push({ field, confidence: extraction[field].confidence });
  }

  return { values, fields };
}
