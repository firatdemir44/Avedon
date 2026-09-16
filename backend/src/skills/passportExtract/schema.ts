// Pasaport çıkarımı: modelin döndürdüğü HAM biçim (zod/v4, yapılandırılmış
// çıktı) ve sözlükten geçmiş SON biçim.
//
// Ham biçimde her alan METİN'dir ("95% CO 5% EA", "Ne 30/1 penye"): model
// yalnızca etiketi okur ve yazdığı gibi aktarır; yapıya çevirme (lif anahtarı,
// sayı, birim, tarih) finalize.ts'te deterministik ayrıştırıcılarla yapılır.
// Bu hem yol haritası ilkesi (model hesap yapmaz) hem de teknik zorunluluk:
// alan başına iç içe nesne/enum/dizi içeren şema API'nin gramer sınırını aştı
// ("compiled grammar is too large", 2026-09-16). Fiyat/stok/MOQ/termin şemada
// yoktur, model okusa da aktaramaz.
import * as z from 'zod/v4';
import type { ProductType } from '../../catalog';
import type { CompositionItem, WidthType } from '../../domain/glossary';

const rawField = z.object({
  value: z.string().nullable().describe('Etikette/belgede yazan metin, yazdığı gibi. Yazmıyorsa null.'),
  confidence: z
    .number()
    .describe('0-1 arası güven. 1: açıkça yazıyor. 0.6: kısmen okunuyor ya da güçlü çıkarım. 0.3: zayıf tahmin. Değer null ise 0.'),
  evidence: z.string().nullable().describe('Kanıt: etikette birebir okunan parça. Görsel tahminse kısa gerekçe. Yoksa null.'),
});

export const rawExtractionSchema = z.object({
  type: rawField.describe('Kumaş çeşidi anahtarı: orme, raschel, dokuma, dantel, triko ya da diger.'),
  subtype: rawField.describe('Alt çeşit, yazdığı gibi: süprem, single jersey, interlok, ribana, elastanlı tül, poplin...'),
  code: rawField.describe('Ürün / kalite kodu ya da artikel numarası, yazdığı gibi.'),
  composition: rawField.describe('Lif kompozisyonu yazdığı gibi, tek satır: "95% CO 5% EA" ya da "%82 Poliamid %18 Elastan". Toplamı düzeltme.'),
  weightGsm: rawField.describe('Gramaj (gr/m²) sayı olarak, birimiyle yazabilirsin: "180" ya da "180 gr/m2". Başka birimse (oz/yd²) null bırak, notes\'a yaz.'),
  widthCm: rawField.describe('En (cm): "150" ya da "150 cm". İnç ise null bırak, notes\'a yaz.'),
  widthType: rawField.describe('"acik" (açık en) ya da "tup" (tüp en); yalnızca yazıyorsa.'),
  yarns: rawField.describe('İplikler, noktalı virgülle ayrılmış, yazdığı gibi: "Ne 30/1 penye; 150 D DTY; 140 dtex".'),
  certificates: rawField.describe(
    'Sertifikalar, noktalı virgülle ayrılmış; her biri "ad | numara | geçerlilik(YYYY-AA-GG)": "OEKO-TEX Standard 100 | 20.HTR.98765 | 2027-03-01; GOTS | | ". Bilinmeyen parça boş kalır.'
  ),
  finishTags: rawField.describe('Boya/apre ifadeleri virgülle: "şardonlu, silikonlu, anti-pilling, UV korumalı".'),
  usages: rawField.describe('Kullanım amaçları virgülle: "tişörtlük, spor giyim, mayoluk".'),
  notes: z
    .string()
    .describe('Alanlara sığmayan gözlemler, kısa ve Türkçe: renk, desen, tuşe, marka, okunamayan yerler, çevrilmeyen birimler. Yoksa boş dize.'),
});

export type RawExtraction = z.infer<typeof rawExtractionSchema>;
export type RawField = z.infer<typeof rawField>;

// ---------------------------------------------------------------------------
// Son biçim (API yanıtı; mobil PassportReviewScreen bunu gösterir)
// ---------------------------------------------------------------------------

export interface ExtractedField<T> {
  value: T | null;
  confidence: number;
  evidence: string | null;
}

export interface ExtractedYarn {
  role: '';
  count: number;
  unit: string;
  ply: number;
  yarnType: string;
}

export interface ExtractedCertificate {
  name: string;
  number: string;
  validUntil: string | null;
}

export interface Extraction {
  type: ExtractedField<ProductType>;
  subtype: ExtractedField<string>;
  code: ExtractedField<string>;
  composition: ExtractedField<CompositionItem[]>;
  weightGsm: ExtractedField<number>;
  widthCm: ExtractedField<number>;
  widthType: ExtractedField<WidthType>;
  yarns: ExtractedField<ExtractedYarn[]>;
  certificates: ExtractedField<ExtractedCertificate[]>;
  finishTags: ExtractedField<string[]>;
  usages: ExtractedField<string[]>;
  notes: string;
}

export type ExtractionFieldName = Exclude<keyof Extraction, 'notes'>;

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

// Modelin okuduğu ama sözlükte karşılığı olmayan ya da güveni eşiğin altında
// kalan parçalar: ekranda "okundu ama aktarılmadı" olarak gösterilir.
export interface RejectedValue {
  field: ExtractionFieldName;
  reason:
    | 'unknown_fiber'
    | 'unknown_subtype'
    | 'subtype_not_in_type'
    | 'unknown_certificate'
    | 'unknown_yarn_unit'
    | 'invalid_value'
    | 'low_confidence';
  raw: string;
}

export interface ExtractionResult {
  extraction: Extraction;
  // Makullük uyarıları (kaydı engellemez; passport.ts ile aynı biçim)
  warnings: { codes: string[]; notes: string[] };
  rejected: RejectedValue[];
}
