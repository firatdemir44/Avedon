// "Web sitesinden ürün aktar" işleri: tarama ve kayıt arka planda yürür, durum
// bellekte tutulur (2 saat). Sunucu yeniden başlarsa iş kaybolur; kullanıcı
// yeniden tarar (günlük sınır yalnızca başarılı başlatmayı sayar).
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { isLlmConfigured, isLlmMock } from '../llm';
import { runPassportExtract, MIN_CONFIDENCE } from '../skills/passportExtract';
import { MAX_PRODUCT_IMAGE_CHARS, MAX_PRODUCT_IMAGES } from '../validation';
import { replaceProductImages, serializeUsages } from '../products';
import { replacePassportRelations, resolveContent, writeFieldMeta } from '../passport';
import { isValidSubtype } from '../catalog';
import { matchWatchRulesInBackground } from '../watch';
import { refreshProductLookInBackground } from '../looks';
import { PoliteFetcher, fetchCatalog, ScanError, type CatalogEntry } from './fetcher';
import { parseProductPage } from './parse';
import { buildNote, mapParsed, missingRequired, type ImportItem } from './map';
import { readImportFile, recordToItem, type ImportFile } from './fileImport';

export const JOB_TTL_MS = 2 * 60 * 60 * 1000;
export const MAX_SCANS_PER_DAY = 3;
export const MAX_FILE_IMPORTS_PER_DAY = 10;
const MAX_LLM_FALLBACKS = 30;
const MAX_IMAGES_PER_PRODUCT = Math.min(4, MAX_PRODUCT_IMAGES);
// Tam boy dosya en çok bu kadar bayt indirilir (base64 ~%33 büyür).
const MAX_IMAGE_BYTES = Math.floor((MAX_PRODUCT_IMAGE_CHARS - 40) * 0.74);

export type JobStatus = 'scanning' | 'ready' | 'committing' | 'done' | 'failed';

export interface ImportJob {
  id: string;
  // web: site taraması · file: yüklenen Excel/CSV/PDF/fotoğraf
  source: 'web' | 'file';
  fileName: string;
  // İş geneli uyarılar (ör. eşleşmeyen sütunlar)
  notices: string[];
  companyId: string;
  userId: string;
  url: string;
  status: JobStatus;
  error: string | null;
  progress: { done: number; total: number };
  items: ImportItem[];
  commit: { done: number; total: number; created: number; skipped: number; failed: number } | null;
  createdAt: number;
}

const jobs = new Map<string, ImportJob>();
const scanCounts = new Map<string, { day: string; n: number }>();
const fileCounts = new Map<string, { day: string; n: number }>();

function sweep() {
  const now = Date.now();
  for (const [id, job] of jobs) if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
}

export function getJob(id: string, companyId: string) {
  sweep();
  const job = jobs.get(id);
  return job && job.companyId === companyId ? job : null;
}

export function scansLeftToday(companyId: string, source: 'web' | 'file' = 'web') {
  const day = new Date().toISOString().slice(0, 10);
  const used = (source === 'web' ? scanCounts : fileCounts).get(companyId);
  return (source === 'web' ? MAX_SCANS_PER_DAY : MAX_FILE_IMPORTS_PER_DAY) - (used && used.day === day ? used.n : 0);
}

function countScan(companyId: string, source: 'web' | 'file' = 'web') {
  const day = new Date().toISOString().slice(0, 10);
  const map = source === 'web' ? scanCounts : fileCounts;
  const used = map.get(companyId);
  map.set(companyId, { day, n: (used && used.day === day ? used.n : 0) + 1 });
}

function newJob(input: { companyId: string; userId: string; url: string; source: 'web' | 'file'; fileName?: string }): ImportJob {
  sweep();
  const job: ImportJob = {
    id: randomUUID(),
    source: input.source,
    fileName: input.fileName ?? '',
    notices: [],
    companyId: input.companyId,
    userId: input.userId,
    url: input.url,
    status: 'scanning',
    error: null,
    progress: { done: 0, total: 0 },
    items: [],
    commit: null,
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  countScan(input.companyId, input.source);
  return job;
}

// Firmada aynı kodla ürün var mı (büyük/küçük harf ve boşluk farkı yok sayılır).
const normCode = (code: string) => code.trim().toLocaleUpperCase('tr-TR').replace(/\s+/g, '');

async function existingCodes(companyId: string) {
  const rows = await prisma.product.findMany({ where: { companyId }, select: { code: true } });
  return new Set(rows.map((r) => normCode(r.code)));
}

// Etiketler eksikse sayfa metninden yapay zekâ ile tamamlama (yalnızca gerçek model varken).
async function llmFill(item: ImportItem, text: string) {
  const out = await runPassportExtract({ images: [], document: null, text, hints: item.type ? { type: item.type } : {} });
  const x = out.extraction;
  const ok = <T>(f: { value: T | null; confidence: number }) => f.value !== null && f.confidence >= MIN_CONFIDENCE;
  if (!item.code && ok(x.code)) {
    item.code = x.code.value!.slice(0, 60);
    item.llmFields.push('code');
  }
  if (!item.type && ok(x.type)) {
    item.type = x.type.value!;
    item.llmFields.push('type');
  }
  if (!item.subtype && ok(x.subtype) && item.type && isValidSubtype(item.type, x.subtype.value!)) {
    item.subtype = x.subtype.value!;
    item.llmFields.push('subtype');
  }
  if (item.weightGsm === null && ok(x.weightGsm)) {
    item.weightGsm = x.weightGsm.value!;
    item.llmFields.push('weightGsm');
  }
  if (item.widthCm === null && ok(x.widthCm)) {
    item.widthCm = x.widthCm.value!;
    item.llmFields.push('widthCm');
  }
  if (!item.compositionText && ok(x.composition) && x.composition.value!.length) {
    item.compositionText = x.composition.value!.map((c) => `%${c.percent} ${c.fiber}`).join(' ');
    item.llmFields.push('composition');
  }
  if (!item.usages.length && ok(x.usages)) {
    item.usages = x.usages.value!;
    item.llmFields.push('usages');
  }
  if (item.llmFields.length) item.warnings.push('Bazı alanlar yapay zekâ ile tamamlandı, kontrol edin');
}

function recomputeWarnings(item: ImportItem) {
  // Yapay zekâ doldurduysa "bulunamadı" uyarıları düşer.
  const filled: Record<string, boolean> = {
    'Ürün kodu bulunamadı': !!item.code,
    'Kumaş çeşidi bulunamadı': !!item.type,
    'Gramaj bulunamadı': item.weightGsm !== null,
    'En bulunamadı': item.widthCm !== null,
    'İçerik bulunamadı': !!item.compositionText,
  };
  item.warnings = item.warnings.filter((w) => !filled[w]);
  if (missingRequired(item).length) item.warnings.unshift('Eksik bilgi: bu ürün eklenemez');
}

export async function runScan(job: ImportJob, fetcher: PoliteFetcher) {
  let entries: CatalogEntry[];
  try {
    entries = await fetchCatalog(fetcher, job.url);
  } catch (err) {
    job.status = 'failed';
    job.error = err instanceof ScanError ? err.code : 'unreachable';
    return;
  }
  if (!entries.length) {
    job.status = 'failed';
    job.error = 'no_products';
    return;
  }
  job.progress = { done: 0, total: entries.length };
  const useLlm = isLlmConfigured() && !isLlmMock();
  let llmCalls = 0;
  let unreadable = 0;
  const seenCodes = new Map<string, string>();

  for (const [i, entry] of entries.entries()) {
    try {
      const html = await fetcher.text(entry.url);
      if (html) {
        const parsed = parseProductPage(html, entry.url);
        if (!parsed.name && entry.name) parsed.name = entry.name;
        if (!parsed.images.length && entry.featuredImage) parsed.images.push({ url: entry.featuredImage, smallUrl: null });
        const item = mapParsed(parsed, entry.url, `p${i}`);
        if (useLlm && missingRequired(item).length && llmCalls < MAX_LLM_FALLBACKS && parsed.mainText.length > 40) {
          llmCalls++;
          await llmFill(item, parsed.mainText).catch((err) => console.error('[catalogImport] llm', err));
        }
        recomputeWarnings(item);
        // Aynı kod sitede iki üründe geçiyorsa (ör. düz ve baskılı) ikisi de
        // listelenir ama yalnızca biri eklenebilir (kayıtta kod tekrarlanmaz).
        const nc = item.code ? normCode(item.code) : '';
        const first = nc ? seenCodes.get(nc) : undefined;
        if (first) (item.duplicate = true), item.warnings.push(`Aynı kod "${first}" ürününde de var; yalnızca biri eklenir`);
        else if (nc) seenCodes.set(nc, item.name || item.code);
        job.items.push(item);
      } else {
        unreadable++;
      }
    } catch (err) {
      unreadable++;
      console.error('[catalogImport] page', entry.url, err);
    }
    job.progress = { done: i + 1, total: entries.length };
  }
  if (unreadable) job.notices.push(`${unreadable} sayfa okunamadı ya da robots.txt izin vermedi`);

  await finishScan(job);
}

async function finishScan(job: ImportJob) {
  const codes = await existingCodes(job.companyId);
  for (const item of job.items) item.exists = !!item.code && codes.has(normCode(item.code));
  job.status = job.items.length ? 'ready' : 'failed';
  if (!job.items.length) job.error = 'no_products';
}

export async function runFileJob(job: ImportJob, file: ImportFile) {
  let result;
  try {
    result = await readImportFile(file);
  } catch (err) {
    console.error('[catalogImport] file', err);
    job.status = 'failed';
    job.error = err instanceof Error && err.name === 'LlmNotConfiguredError' ? 'llm_not_configured' : 'unreadable_file';
    return;
  }
  job.notices = result.notices;
  job.progress = { done: 0, total: result.records.length };
  const seenCodes = new Set<string>();
  const fromLlm = file.kind === 'pdf' || file.kind === 'image';
  result.records.forEach((rec, i) => {
    const item = recordToItem(rec, 'f' + i);
    // PDF/fotoğraftan okunan her alan yapay zekâ çıkarımıdır (daha düşük güven).
    if (fromLlm) item.llmFields = ['code', 'type', 'subtype', 'weightGsm', 'widthCm', 'composition', 'usages', 'price', 'stock', 'moq', 'leadTimeDays'];
    recomputeWarnings(item);
    const nc = item.code ? normCode(item.code) : '';
    if (nc && seenCodes.has(nc)) (item.duplicate = true), item.warnings.push('Aynı kod dosyada birden çok satırda var; yalnızca ilki eklenir');
    else if (nc) seenCodes.add(nc);
    job.items.push(item);
    job.progress = { done: i + 1, total: result.records.length };
  });
  await finishScan(job);
  if (job.status === 'failed' && !job.notices.length) job.notices.push('Dosyada ürün satırı bulunamadı');
}

export function startFileJob(input: { companyId: string; userId: string; fileName: string; file: ImportFile }) {
  const job = newJob({ companyId: input.companyId, userId: input.userId, url: '', source: 'file', fileName: input.fileName });
  runFileJob(job, input.file).catch((err) => {
    console.error('[catalogImport] file job', err);
    job.status = 'failed';
    job.error = 'unreadable_file';
  });
  return job;
}

export function startScan(input: { companyId: string; userId: string; url: string }, fetcher = new PoliteFetcher(input.url)) {
  const job = newJob({ ...input, source: 'web' });
  runScan(job, fetcher).catch((err) => {
    console.error('[catalogImport] scan', err);
    job.status = 'failed';
    job.error = 'unreachable';
  });
  return job;
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Önce tam boy, sınırı aşarsa sitenin kendi küçük kopyası; o da olmazsa atlanır.
async function downloadImage(fetcher: PoliteFetcher, image: { url: string; smallUrl: string | null }) {
  for (const url of [image.url, image.smallUrl]) {
    if (!url) continue;
    const got = await fetcher.bytes(url, MAX_IMAGE_BYTES).catch(() => null);
    if (!got) continue;
    const type = IMAGE_TYPES.has(got.contentType) ? got.contentType : /\.png(\?|$)/i.test(url) ? 'image/png' : /\.jpe?g(\?|$)/i.test(url) ? 'image/jpeg' : null;
    if (!type) continue;
    const dataUrl = `data:${type};base64,${got.data.toString('base64')}`;
    if (dataUrl.length <= MAX_PRODUCT_IMAGE_CHARS) return dataUrl;
  }
  return null;
}

async function createOne(job: ImportJob, item: ImportItem, fetcher: PoliteFetcher | null) {
  const images: string[] = [];
  for (const img of fetcher ? item.images.slice(0, MAX_IMAGES_PER_PRODUCT) : []) {
    const data = await downloadImage(fetcher!, img);
    if (data) images.push(data);
  }
  const resolved = resolveContent({ content: item.compositionText });
  const type = item.type!;
  const subtype = isValidSubtype(type, item.subtype) ? item.subtype : '';
  const confidence = (field: string) => (item.llmFields.includes(field) ? 0.6 : 0.9);
  const c = item.commerce;
  const fields = [
    'code', 'type', 'weightGsm', 'widthCm',
    ...(subtype ? ['subtype'] : []),
    ...(item.usages.length ? ['usages'] : []),
    ...(c.priceValue !== null ? ['price'] : []),
    ...(c.stock !== null ? ['stock'] : []),
    ...(c.moq !== null ? ['moq'] : []),
    ...(c.leadTimeDays !== null ? ['leadTimeDays'] : []),
  ];
  const source = job.source;

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        companyId: job.companyId,
        code: item.code.trim(),
        type,
        subtype,
        usages: serializeUsages(item.usages),
        stock: c.stock ?? 0,
        stockUnit: c.stockUnit,
        ...(c.priceValue !== null ? { priceValue: c.priceValue, priceCurrency: c.priceCurrency, priceUnit: c.priceUnit } : {}),
        ...(c.moq !== null ? { moq: c.moq, moqUnit: c.priceUnit || c.stockUnit } : {}),
        ...(c.leadTimeDays !== null ? { leadTimeDays: c.leadTimeDays } : {}),
        weightGsm: item.weightGsm!,
        widthCm: item.widthCm!,
        content: resolved.content,
        useArea: buildNote(item),
        ...(resolved.composition?.length ? { passportUpdatedAt: new Date() } : {}),
      },
      select: { id: true },
    });
    await replaceProductImages(tx, created.id, images);
    if (resolved.composition?.length) await replacePassportRelations(tx, created.id, { composition: resolved.composition });
    // Kaynak "web"/"file": ürün sayfasında "onay bekleyen alan" olarak görünür.
    await writeFieldMeta(tx, created.id, [
      ...fields.map((field) => ({ field, confidence: confidence(field), source, confirmed: false })),
      ...(resolved.composition?.length
        ? [{ field: 'composition', confidence: Math.min(resolved.fieldMeta?.confidence ?? 0.9, confidence('composition')), source, confirmed: false }]
        : []),
    ]);
    return created;
  });
  matchWatchRulesInBackground(product.id);
  refreshProductLookInBackground(product.id);
}

export async function runCommit(job: ImportJob, keys: string[], fetcher: PoliteFetcher | null = job.source === 'web' ? new PoliteFetcher(job.url) : null) {
  const wanted = new Set(keys);
  const selected = job.items.filter((i) => wanted.has(i.key));
  job.commit = { done: 0, total: selected.length, created: 0, skipped: 0, failed: 0 };
  job.status = 'committing';
  if (fetcher) await fetcher.init();
  const codes = await existingCodes(job.companyId);
  for (const item of selected) {
    try {
      const nc = normCode(item.code);
      if (missingRequired(item).length || codes.has(nc)) {
        job.commit.skipped++;
      } else {
        await createOne(job, item, fetcher);
        codes.add(nc);
        item.exists = true;
        job.commit.created++;
      }
    } catch (err) {
      console.error('[catalogImport] commit', item.sourceUrl, err);
      job.commit.failed++;
    }
    job.commit.done++;
  }
  job.status = 'done';
}

export function startCommit(job: ImportJob, keys: string[]) {
  runCommit(job, keys).catch((err) => {
    console.error('[catalogImport] commit', err);
    job.status = 'done';
  });
}

// API yanıtı: indirme için tutulan iç alanlar (tam boy adresler) dönmez.
export function toJobView(job: ImportJob) {
  return {
    jobId: job.id,
    source: job.source,
    url: job.url,
    fileName: job.fileName,
    notices: job.notices,
    status: job.status,
    error: job.error,
    progress: job.progress,
    commit: job.commit,
    items: job.status === 'scanning' ? [] : job.items.map(({ images: _images, llmFields: _llm, unmappedUses, ...rest }) => ({ ...rest, unmappedUses, canImport: missingRequired(rest as ImportItem).length === 0, duplicate: !!rest.duplicate })),
  };
}

// Testler için
export function _resetForTests() {
  jobs.clear();
  scanCounts.clear();
  fileCounts.clear();
}
