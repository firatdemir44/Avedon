// Hazır ürün dosyasından aktarım: Excel/CSV tablo olarak okunur (başlık satırı
// ve sütunlar sözlükle bulunur), PDF ve fotoğraf yapay zekâ ile satırlara
// çevrilir. Sonuç web taramasıyla aynı ImportItem biçimine dönüşür.
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';
import * as XLSX from 'xlsx';
import { LLM_MODELS, LlmNotConfiguredError, LlmOutputError, getAnthropic, isLlmMock } from '../llm';
import { fold } from '../domain/glossary';
import { mapParsed, type ImportItem, type ImportCommerce } from './map';
import { parseWeight, parseWidth, splitUses } from './parse';

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_ROWS = 500;

export type ImportFile =
  | { kind: 'sheet'; data: Buffer }
  | { kind: 'csv'; text: string }
  | { kind: 'pdf'; data: string }
  | { kind: 'image'; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; data: string };

const SHEET_MIME = /^(application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|application\/vnd\.ms-excel|application\/x-excel|application\/excel)$/i;
const CSV_MIME = /^(text\/csv|application\/csv|text\/comma-separated-values|text\/plain|text\/tab-separated-values)$/i;

// data URL + dosya adı → dosya türü. Tarayıcılar .csv'yi bazen octet-stream ya
// da vnd.ms-excel diye gönderdiği için uzantı da dikkate alınır.
export function splitImportFile(dataUrl: string, fileName = ''): ImportFile | null {
  const m = /^data:([^;,]*)(?:;[^,]*)?;base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const b64 = m[2];
  if (Math.floor((b64.length * 3) / 4) > MAX_IMPORT_FILE_BYTES) return null;
  const ext = (fileName.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();
  if (ext === 'csv' || ext === 'tsv' || (CSV_MIME.test(mime) && ext !== 'xlsx' && ext !== 'xls')) {
    return { kind: 'csv', text: decodeText(Buffer.from(b64, 'base64')) };
  }
  if (ext === 'xlsx' || ext === 'xls' || SHEET_MIME.test(mime)) return { kind: 'sheet', data: Buffer.from(b64, 'base64') };
  if (mime === 'application/pdf' || ext === 'pdf') return { kind: 'pdf', data: b64 };
  const img = /^image\/(jpeg|png|webp|gif)$/.exec(mime);
  if (img) return { kind: 'image', mediaType: mime as 'image/jpeg', data: b64 };
  return null;
}

// UTF-8 (BOM'lu/BOM'suz); geçersizse Türkçe Windows kod sayfası (Excel'in eski CSV'si).
function decodeText(buf: Buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1254').decode(buf);
  }
}

function detectDelimiter(text: string) {
  const first = text.split(/\r?\n/).slice(0, 5).join('\n');
  const counts = [';', ',', '\t'].map((d) => [d, first.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

export function readTable(file: Extract<ImportFile, { kind: 'sheet' | 'csv' }>): string[][] {
  const wb =
    file.kind === 'csv'
      ? XLSX.read(file.text, { type: 'string', FS: detectDelimiter(file.text), raw: true })
      : XLSX.read(file.data, { type: 'buffer', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '', blankrows: false });
  return rows.slice(0, MAX_FILE_ROWS + 20).map((r) => r.map((c) => String(c ?? '').replace(/\s+/g, ' ').trim()));
}

export const COLUMN_FIELDS = ['code', 'name', 'type', 'weight', 'width', 'composition', 'uses', 'price', 'currency', 'stock', 'moq', 'leadTime'] as const;
export type ColumnField = (typeof COLUMN_FIELDS)[number];

// Katlanmış (fold) başlık → alan. Tam eşleşme önce, sonra "içinde geçer".
const HEADER_DICT: Record<ColumnField, string[]> = {
  code: ['kod', 'kodu', 'urun kodu', 'code', 'product code', 'item code', 'artikel', 'artikel no', 'article', 'article no', 'art no', 'art. no', 'ref', 'referans', 'stok kodu', 'sku', 'model'],
  name: ['ad', 'adi', 'urun adi', 'urun', 'name', 'product name', 'product', 'aciklama', 'description', 'kumas adi', 'kalite', 'quality'],
  type: ['tur', 'turu', 'tip', 'tipi', 'urun tipi', 'kumas turu', 'kumas tipi', 'type', 'product type', 'fabric type', 'cins', 'kumas cinsi', 'orgu', 'orgu cinsi'],
  weight: ['gramaj', 'gr/m2', 'gsm', 'weight', 'agirlik', 'gr', 'g/m2', 'gram'],
  width: ['en', 'eni', 'width', 'genislik', 'kumas eni', 'en cm', 'en (cm)'],
  composition: ['icerik', 'kompozisyon', 'composition', 'comp', 'content', 'hammadde', 'karisim', 'fiber'],
  uses: ['kullanim', 'kullanim alani', 'kullanim alanlari', 'uses', 'usage', 'end use', 'application'],
  price: ['fiyat', 'birim fiyat', 'price', 'unit price', 'fiyati', 'liste fiyati'],
  currency: ['para birimi', 'doviz', 'currency', 'kur', 'pb'],
  stock: ['stok', 'stock', 'miktar', 'quantity', 'qty', 'mevcut', 'eldeki'],
  moq: ['moq', 'min siparis', 'minimum siparis', 'minimum order', 'asgari siparis', 'min. siparis', 'min order'],
  leadTime: ['termin', 'teslim suresi', 'lead time', 'teslim', 'uretim suresi', 'delivery'],
};

const DICT_ENTRIES = COLUMN_FIELDS.flatMap((f) => HEADER_DICT[f].map((h) => [fold(h), f] as const)).sort((a, b) => b[0].length - a[0].length);

export function matchHeader(header: string): ColumnField | null {
  const h = fold(header).replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!h) return null;
  for (const [k, f] of DICT_ENTRIES) if (h === k) return f;
  // "Fiyat (USD/kg)", "Gramaj gr/m²" gibi: kelime sınırında geçen en uzun terim.
  for (const [k, f] of DICT_ENTRIES) {
    if (k.length < 3) continue;
    if (new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}([^a-z]|$)`).test(h)) return f;
  }
  return null;
}

export interface HeaderResult {
  index: number;
  headers: string[];
  mapping: (ColumnField | null)[];
}

// İlk 15 satırda en çok sütunu tanınan satır başlıktır (en az 2 tanınmış sütun).
export function findHeader(rows: string[][]): HeaderResult | null {
  let best: HeaderResult | null = null;
  let bestScore = 1;
  rows.slice(0, 15).forEach((row, index) => {
    const mapping = row.map(matchHeader);
    // Aynı alana giden ikinci sütun yok sayılır.
    const used = new Set<ColumnField>();
    const dedup = mapping.map((f) => (f && !used.has(f) ? (used.add(f), f) : null));
    const score = dedup.filter(Boolean).length;
    if (score > bestScore) {
      bestScore = score;
      best = { index, headers: row, mapping: dedup };
    }
  });
  return best;
}

export interface RowRecord {
  code: string;
  name: string;
  typeText: string;
  weightText: string;
  widthText: string;
  compositionText: string;
  usesText: string;
  priceText: string;
  currencyText: string;
  stockText: string;
  moqText: string;
  leadTimeText: string;
  // Başlıklardaki birim/para ipuçları ("Fiyat (USD/kg)", "Stok (kg)")
  priceHeader: string;
  stockHeader: string;
}

const EMPTY_RECORD: RowRecord = {
  code: '', name: '', typeText: '', weightText: '', widthText: '', compositionText: '', usesText: '',
  priceText: '', currencyText: '', stockText: '', moqText: '', leadTimeText: '', priceHeader: '', stockHeader: '',
};

const FIELD_TO_KEY: Record<ColumnField, keyof RowRecord> = {
  code: 'code', name: 'name', type: 'typeText', weight: 'weightText', width: 'widthText', composition: 'compositionText',
  uses: 'usesText', price: 'priceText', currency: 'currencyText', stock: 'stockText', moq: 'moqText', leadTime: 'leadTimeText',
};

export function rowsToRecords(rows: string[][], header: HeaderResult): RowRecord[] {
  const out: RowRecord[] = [];
  for (const row of rows.slice(header.index + 1)) {
    if (!row.some((c) => c)) continue;
    const rec: RowRecord = { ...EMPTY_RECORD };
    header.mapping.forEach((field, col) => {
      if (!field) return;
      rec[FIELD_TO_KEY[field]] = (row[col] ?? '').trim();
      if (field === 'price') rec.priceHeader = header.headers[col] ?? '';
      if (field === 'stock') rec.stockHeader = header.headers[col] ?? '';
    });
    // Toplam / boş satırlar
    if (!rec.code && !rec.name) continue;
    if (/^(toplam|total|genel toplam)$/i.test(rec.code || rec.name)) continue;
    out.push(rec);
    if (out.length >= MAX_FILE_ROWS) break;
  }
  return out;
}

// --- Değer ayrıştırma ---

export function parseNumber(text: string): number | null {
  const m = text.replace(/\s/g, '').match(/-?\d[\d.,]*/);
  if (!m) return null;
  let s = m[0];
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // Hangisi sondaysa ondalık ayırıcı o.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // "1,250" binlik mi ondalık mı? Virgülden sonra tam 3 hane ve tek virgülse binlik.
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // Türkçe binlik ayırıcı: "1.250" = 1250.
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function detectCurrency(text: string): ImportCommerce['priceCurrency'] {
  if (/₺|\btl\b|\btry\b|\blira\b/i.test(text)) return 'TRY';
  if (/\$|\busd\b|\bdolar\b|\bdollar\b/i.test(text)) return 'USD';
  if (/€|\beur\b|\beuro\b|\bavro\b/i.test(text)) return 'EUR';
  return '';
}

export function detectUnit(text: string): '' | 'm' | 'kg' {
  if (/\bkg\b|kilo/i.test(text)) return 'kg';
  if (/\/\s*m\b|\bmt\b|\bmetre\b|\bmeter\b|\bm\b/i.test(text)) return 'm';
  return '';
}

export function parseLeadTime(text: string): number | null {
  const n = parseNumber(text);
  if (n === null || n < 0) return null;
  const days = /hafta|week/i.test(text) ? n * 7 : /\bay\b|month/i.test(text) ? n * 30 : n;
  return days <= 365 ? Math.round(days) : null;
}

export function recordToItem(rec: RowRecord, key: string): ImportItem {
  const item = mapParsed(
    {
      name: rec.name.slice(0, 120),
      code: rec.code.slice(0, 60),
      typeText: rec.typeText,
      weightGsm: rec.weightText ? parseWeight(rec.weightText) : null,
      widthCm: rec.widthText ? parseWidth(rec.widthText) : null,
      compositionText: rec.compositionText.slice(0, 200),
      uses: [...new Set(splitUses(rec.usesText).map((u) => u.toUpperCase()))],
      images: [],
      mainText: '',
    },
    '',
    key
  );
  // Ad alanında çeşit geçiyor olabilir ("Süprem 30/1"); tür sütunu da denenir.
  item.warnings = item.warnings.filter((w) => w !== 'Fotoğraf bulunamadı');

  const c = item.commerce;
  if (rec.priceText) {
    const value = parseNumber(rec.priceText);
    if (value !== null && value >= 0) {
      c.priceValue = value;
      c.priceCurrency = detectCurrency(`${rec.priceText} ${rec.currencyText} ${rec.priceHeader}`);
      c.priceUnit = detectUnit(`${rec.priceText.replace(/^[^/]*/, '')} ${rec.priceHeader.replace(/^[^/(]*/, '')}`);
      if (!c.priceCurrency) item.warnings.push('Fiyatın para birimi belirsiz; fiyat birimsiz kaydedilir, kontrol edin');
    }
  }
  if (rec.stockText) {
    const value = parseNumber(rec.stockText);
    if (value !== null && value >= 0) {
      c.stock = value;
      c.stockUnit = detectUnit(`${rec.stockText.replace(/^[\d.,\s]*/, '')} ${rec.stockHeader}`) || 'm';
    }
  }
  if (rec.moqText) {
    const value = parseNumber(rec.moqText);
    if (value !== null && value > 0) c.moq = value;
  }
  if (rec.leadTimeText) c.leadTimeDays = parseLeadTime(rec.leadTimeText);
  return item;
}

// --- Yapay zekâ: eşleşmeyen başlıklar ---

const headerMapSchema = z.object({
  columns: z.array(z.object({ index: z.number().int(), field: z.enum([...COLUMN_FIELDS, 'ignore']) })),
});

// Yalnızca başlıklar + 3 örnek satır gönderilir. Gerçek model yoksa eşleme değişmez.
export async function llmMapHeaders(header: HeaderResult, samples: string[][]): Promise<HeaderResult> {
  const unmatched = header.mapping.map((f, i) => (f ? -1 : i)).filter((i) => i >= 0 && header.headers[i]);
  if (!unmatched.length || isLlmMock()) return header;
  const client = getAnthropic();
  if (!client) return header;
  const used = new Set(header.mapping.filter(Boolean));
  const lines = unmatched.map((i) => `${i}: "${header.headers[i]}" örnekler: ${samples.map((r) => JSON.stringify(r[i] ?? '')).join(', ')}`);
  const message = await client.messages.parse({
    model: LLM_MODELS.extract,
    max_tokens: 1500,
    system:
      'Bir tekstil firmasının ürün listesindeki sütun başlıklarını alanlara eşle. Alanlar: code (ürün kodu), name (ürün adı), type (kumaş türü), weight (gramaj gr/m2), width (en cm), composition (içerik/hammadde oranları), uses (kullanım alanı), price (fiyat), currency (para birimi), stock (stok miktarı), moq (en az sipariş), leadTime (termin). Emin değilsen ignore ver.',
    output_config: { effort: 'low', format: zodOutputFormat(headerMapSchema) },
    messages: [{ role: 'user', content: [{ type: 'text', text: `Eşlenecek sütunlar:\n${lines.join('\n')}\n\nZaten eşlenmiş alanlar: ${[...used].join(', ') || 'yok'}` }] }],
  });
  const out = message.parsed_output;
  if (!out) return header;
  const mapping = [...header.mapping];
  for (const col of out.columns) {
    if (!unmatched.includes(col.index) || col.field === 'ignore' || used.has(col.field)) continue;
    mapping[col.index] = col.field;
    used.add(col.field);
  }
  return { ...header, mapping };
}

// --- Yapay zekâ: PDF / fotoğraf ---

const extractedRowSchema = z.object({
  code: z.string(),
  name: z.string(),
  typeText: z.string(),
  weightText: z.string(),
  widthText: z.string(),
  compositionText: z.string(),
  usesText: z.string(),
  priceText: z.string(),
  currencyText: z.string(),
  stockText: z.string(),
});
const extractedDocSchema = z.object({ isProductList: z.boolean(), rows: z.array(extractedRowSchema) });

const DOC_SYSTEM = `Sen bir tekstil firmasının ürün kataloğunu / fiyat listesini okuyan bir asistansın.
Belgedeki her ürünü (kumaş/iplik artikeli) bir satır olarak çıkar:
- code: ürün/artikel kodu (belgedeki yazımla) · name: ürün adı
- typeText: kumaş türü (Örme/Knitted, Dokuma/Woven, Raschel, Dantel/Lace, Triko) belgede yazdığı gibi
- weightText: gramaj birimiyle ("166 gr/m2") · widthText: en birimiyle ("160 cm")
- compositionText: içerik aynen ("%92 PES %8 EA") · usesText: kullanım alanları virgülle
- priceText: fiyat birimiyle aynen ("4,50 USD/kg") · currencyText: para birimi yazıyorsa · stockText: stok miktarı birimiyle
Kurallar: Okuyamadığın ya da belgede olmayan alanı UYDURMA, "" ver. Başlık, toplam ve açıklama satırlarını alma. Satır sırasını koru.
Belgede ürün listesi yoksa isProductList=false ve rows boş.`;

export const MOCK_DOC_ROWS: RowRecord[] = [
  { ...EMPTY_RECORD, code: 'MOCK-001', name: 'Süprem', typeText: 'Örme', weightText: '160 gr/m2', widthText: '180 cm', compositionText: '%100 Pamuk', usesText: 'Tişörtlük', priceText: '4,50 USD/kg', stockText: '1200 kg' },
  { ...EMPTY_RECORD, code: 'MOCK-002', name: 'Crepe Supreme', typeText: 'Knitted', weightText: '166 gr/m2', widthText: '160 cm', compositionText: '%92 PES %8 EA', usesText: 'Sports, Fitness', priceText: '120' },
];

export async function extractDocRows(file: Extract<ImportFile, { kind: 'pdf' | 'image' }>): Promise<RowRecord[]> {
  if (isLlmMock()) return MOCK_DOC_ROWS.map((r) => ({ ...r }));
  const client = getAnthropic();
  if (!client) throw new LlmNotConfiguredError();
  const source =
    file.kind === 'pdf'
      ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } } as const)
      : ({ type: 'image', source: { type: 'base64', media_type: file.mediaType, data: file.data } } as const);
  const message = await client.messages.parse({
    model: LLM_MODELS.extract,
    max_tokens: 32000,
    system: DOC_SYSTEM,
    output_config: { effort: 'low', format: zodOutputFormat(extractedDocSchema) },
    messages: [{ role: 'user', content: [source, { type: 'text', text: 'Bu belgedeki tüm ürün satırlarını çıkar.' }] }],
  });
  const out = message.parsed_output ?? null;
  if (!out) throw new LlmOutputError(`model ürün listesi vermedi (stop_reason: ${message.stop_reason})`);
  if (!out.isProductList) return [];
  return out.rows.slice(0, MAX_FILE_ROWS).map((r) => ({ ...EMPTY_RECORD, ...r }));
}

export interface FileReadResult {
  records: RowRecord[];
  notices: string[];
  llmUsed: boolean;
}

export async function readImportFile(file: ImportFile): Promise<FileReadResult> {
  if (file.kind === 'pdf' || file.kind === 'image') {
    return { records: await extractDocRows(file), notices: [], llmUsed: true };
  }
  const rows = readTable(file);
  let header = findHeader(rows);
  if (!header) return { records: [], notices: ['Tabloda başlık satırı bulunamadı (Kod, Gramaj, En, İçerik gibi sütun adları arandı)'], llmUsed: false };
  let llmUsed = false;
  if (header.mapping.some((f, i) => !f && header!.headers[i])) {
    try {
      const mapped = await llmMapHeaders(header, rows.slice(header.index + 1, header.index + 4));
      llmUsed = mapped !== header;
      header = mapped;
    } catch (err) {
      console.error('[catalogImport] header map', err);
    }
  }
  const notices: string[] = [];
  const unmatched = header.headers.filter((h, i) => h && !header!.mapping[i]);
  if (unmatched.length) notices.push(`Eşleşmeyen sütunlar alınmadı: ${unmatched.join(', ')}`);
  if (!header.mapping.includes('code')) notices.push('Kod sütunu bulunamadı: ürünler kodsuz eklenemez');
  return { records: rowsToRecords(rows, header), notices, llmUsed };
}
