// Pasaport satır editörlerinin ortak tipleri ve yardımcıları.
// Hem kumaş formu (AddProductScreen) hem iplik formu (YarnFormScreen) bunları
// kullanır; iki ekranda birebir aynı olan kod burada tek nüsha durur.
// Sunucuya giden biçim DEĞİŞMEDİ: certificateInputs / composition eşlemesi
// eskiden iki ekranda yazılı olan kodun aynısıdır.

import type { CertificateInput, DocImageInput, ProductCertificate } from '../../api/client';
import { pickCompressedImage } from '../../features/imagePicker';
import { DocumentPickError, pickPdf } from '../../features/documentPicker';
import { MAX_COMPOSITION_ROWS } from '../../features/products/limits';
import { FIBERS } from '../../features/products/glossaryLabels';
import { parseNumber, toInputNumber } from '../../features/calculators/parse';

// Satırlar metin olarak tutuluyor (kullanıcı "15," yazarken silinmesin diye);
// kaydederken sayıya çevriliyor.
export interface CompositionRow {
  key: string;
  fiber: string;
  percent: string;
}

// Belge fotoğrafı üç durumdan biri: yok · sunucudaki eski sıradaki · yeni seçilen.
export type DocImage =
  | { kind: 'none' }
  | { kind: 'existing'; position: number; uri: string | null }
  | { kind: 'new'; uri: string; dataUrl: string };

export interface CertificateRow {
  key: string;
  name: string;
  number: string;
  // Kullanıcının yazdığı biçim: YYYY-AA-GG (boş bırakılabilir).
  validUntil: string;
  image: DocImage;
}

let rowSeq = 0;
export const newKey = (prefix: string) => `${prefix}-${++rowSeq}`;

export const emptyCompositionRow = (fiber = ''): CompositionRow => ({
  key: newKey('lif'),
  fiber,
  percent: fiber ? '100' : '',
});

export const emptyCertificateRow = (): CertificateRow => ({
  key: newKey('sertifika'),
  name: '',
  number: '',
  validUntil: '',
  image: { kind: 'none' },
});

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Sunucudan gelen ISO tarihi form alanına: "2027-03-01T00:00:00.000Z" → "2027-03-01".
export const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

export const compositionRowsFrom = (items: { fiber: string; percent: number }[]): CompositionRow[] =>
  items.map((item) => ({ key: newKey('lif'), fiber: item.fiber, percent: toInputNumber(item.percent) }));

export const certificateRowsFrom = (certificates: ProductCertificate[]): CertificateRow[] =>
  certificates.map((c) => ({
    key: newKey('sertifika'),
    name: c.name,
    number: c.number ?? '',
    validUntil: toDateInput(c.validUntil),
    image: c.hasImage ? { kind: 'existing', position: c.position, uri: null } : { kind: 'none' },
  }));

// Sunucudan gelen belge önizlemesini ilgili satıra yazar (sıra numarasıyla).
export const withCertificateImage = (
  rows: CertificateRow[],
  position: number,
  uri: string
): CertificateRow[] =>
  rows.map((row) =>
    row.image.kind === 'existing' && row.image.position === position
      ? { ...row, image: { ...row.image, uri } }
      : row
  );

// Eski serbest içerik metnini ("%95 Pamuk %5 Elastan") satırlara böler.
// Yalnızca TÜM parçalar tanınan life oturursa kabul edilir; tanınmayan bir şey
// varsa kullanıcı satırları kendisi doldursun (sunucu da kaydederken deniyor).
export function splitCompositionText(text: string): CompositionRow[] {
  const matches = [...text.matchAll(/%\s*(\d+(?:[.,]\d+)?)\s*([^%\d]+)/g)];
  if (!matches.length) return [];
  const rows: CompositionRow[] = [];
  for (const match of matches) {
    const name = match[2].trim().toLocaleLowerCase('tr-TR');
    const fiber = FIBERS.find((f) => f.label.toLocaleLowerCase('tr-TR') === name || f.key === name);
    if (!fiber) return [];
    rows.push({ key: newKey('lif'), fiber: fiber.key, percent: match[1].replace('.', ',') });
  }
  return rows.slice(0, MAX_COMPOSITION_ROWS);
}

export interface CompositionState {
  filled: CompositionRow[];
  valid: CompositionRow[];
  total: number;
  // Doldurulmuş ama lif ya da oranı eksik satır var.
  incomplete: boolean;
}

export function compositionState(rows: CompositionRow[]): CompositionState {
  const filled = rows.filter((row) => row.fiber || row.percent.trim());
  const valid = filled.filter(
    (row) => row.fiber && parseNumber(row.percent) > 0 && parseNumber(row.percent) <= 100
  );
  const total = valid.reduce((sum, row) => sum + parseNumber(row.percent), 0);
  return { filled, valid, total, incomplete: filled.length !== valid.length };
}

export const compositionItems = (rows: CompositionRow[]) =>
  rows.map((row) => ({ fiber: row.fiber, percent: parseNumber(row.percent) }));

export const certificateIncomplete = (rows: CertificateRow[]) => rows.some((row) => !row.name);

export const certificateDateInvalid = (rows: CertificateRow[]) =>
  rows.some((row) => row.validUntil.trim() && !DATE_PATTERN.test(row.validUntil.trim()));

// Belge fotoğrafı → sunucu biçimi (yeni fotoğraf · sunucudaki sıra · yok).
export const docImageInput = (image: DocImage): DocImageInput =>
  image.kind === 'new' ? image.dataUrl : image.kind === 'existing' ? { existing: image.position } : null;

export const certificateInputs = (rows: CertificateRow[]): CertificateInput[] =>
  rows
    .filter((row) => row.name)
    .map((row) => ({
      name: row.name,
      number: row.number.trim(),
      validUntil: row.validUntil.trim() ? row.validUntil.trim() : null,
      image: docImageInput(row.image),
    }));

// Belge PDF olabilir (Textile Exchange gibi sertifikalar PDF geliyor). Hem yeni
// seçilende hem sunucudan gelen önizlemede ayırt etme tek yerde: data URL'in
// türüne bakılır (sunucu PDF'i `data:application/pdf;base64,...` döndürüyor).
export const PDF_DATA_PREFIX = 'data:application/pdf';

export const isPdfDoc = (image: DocImage): boolean =>
  image.kind === 'new'
    ? image.dataUrl.startsWith(PDF_DATA_PREFIX)
    : image.kind === 'existing'
      ? !!image.uri?.startsWith(PDF_DATA_PREFIX)
      : false;

export const isPdfDataUrl = (url: string) => url.startsWith(PDF_DATA_PREFIX);

// Sunucu sınırı 2.100.000 karakter base64 (~1,5 MB dosya).
export const MAX_DOC_PDF_CHARS = 2_100_000;
const PDF_TOO_LARGE = "PDF 1,5 MB'ı geçemez.";

// Belge fotoğrafı seçme: iki formda da aynı hata metinleri.
export async function pickDocImage(): Promise<{ image: DocImage } | { error: string } | null> {
  try {
    const picked = await pickCompressedImage();
    if (!picked) return null;
    return { image: { kind: 'new', uri: picked.uri, dataUrl: picked.dataUrl } };
  } catch (err) {
    return {
      error:
        err instanceof Error && err.message === 'permission_denied'
          ? 'Galeriye erişim izni verilmedi.'
          : 'Fotoğraf işlenemedi, lütfen başka bir fotoğraf deneyin.',
    };
  }
}

// Belge olarak PDF seçme (sertifika ve test raporu satırları).
export async function pickDocPdf(): Promise<{ image: DocImage } | { error: string } | null> {
  try {
    const picked = await pickPdf();
    if (!picked) return null;
    const dataUrl = picked.dataBase64.startsWith('data:')
      ? picked.dataBase64
      : `${PDF_DATA_PREFIX};base64,${picked.dataBase64}`;
    if (!dataUrl.startsWith(PDF_DATA_PREFIX)) return { error: 'Yalnızca PDF dosyası seçilebilir.' };
    if (dataUrl.length > MAX_DOC_PDF_CHARS) return { error: PDF_TOO_LARGE };
    return { image: { kind: 'new', uri: dataUrl, dataUrl } };
  } catch (err) {
    return {
      error:
        err instanceof DocumentPickError && err.code === 'too_large'
          ? PDF_TOO_LARGE
          : 'PDF okunamadı, lütfen başka bir dosya deneyin.',
    };
  }
}
