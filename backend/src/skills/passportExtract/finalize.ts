// Ham (metin) model çıktısını sözlük ayrıştırıcılarından geçirir, kanıt
// metniyle çapraz kontrol eder, makullük kontrolüne sokar ve güveni buna göre
// ayarlar. Tamamen deterministik; model çağrısı yok. Yol haritası §3.2: belirsiz
// alan boş kalır ve kullanıcıya "okundu ama aktarılmadı" olarak gösterilir,
// sessizce forma girmez.
import { FINISH_TAGS, PRODUCT_TYPES, USAGES, YARN_TYPES, type ProductType } from '../../catalog';
import {
  TYPE_INDEX,
  TYPICAL_WIDTH,
  buildIndex,
  checkPassport,
  findTerms,
  matchCertificate,
  matchKnit,
  matchTerm,
  parseComposition,
  parseMeasures,
  parseWidthType,
  typeOfSubtype,
  type CompositionItem,
  type SynonymIndex,
  type WidthType,
} from '../../domain/glossary';
import type {
  ExtractedCertificate,
  ExtractedField,
  ExtractedYarn,
  Extraction,
  ExtractionFieldName,
  ExtractionResult,
  RawExtraction,
  RawField,
  RejectedValue,
} from './schema';

// Bu eşiğin altında kalan alan forma AKTARILMAZ (değer null, rejected listesinde).
export const MIN_CONFIDENCE = 0.4;
// Kanıt metni deterministik ayrıştırıcıyla aynı değeri veriyorsa güven en az bu olur.
export const CORROBORATED_CONFIDENCE = 0.95;

// Katalog etiketleri + atölye / İngilizce yazımlar. Bu listeler modelin
// döndürdüğü KISA ifadelere (virgülle ayrılmış parçalara) uygulanır, serbest
// metne değil; o yüzden "fr", "uv" gibi kısa anahtarlar burada güvenli.
const FINISH_SYNONYMS: Record<string, readonly string[]> = {
  sardonlu: ['şardonlu', 'şardon', 'brushed', 'fleece', 'polarlı'],
  yikamali: ['yıkamalı', 'yıkama', 'washed', 'enzim yıkama', 'enzyme washed'],
  peach: ['peach', 'peach skin', 'şeftali tuşe', 'şeftali'],
  silikonlu: ['silikonlu', 'silikon', 'silicone', 'silicon', 'silikon yumuşatma'],
  antipilling: ['anti-pilling', 'antipilling', 'anti pilling', 'pilling'],
  su_itici: ['su itici', 'water repellent', 'su geçirmez', 'waterproof', 'dwr'],
  alev_almaz: ['alev almaz', 'flame retardant', 'fr', 'güç tutuşur', 'fire retardant'],
  antibakteriyel: ['antibakteriyel', 'antibacterial', 'anti-bacterial'],
  uv_koruma: ['uv koruma', 'uv korumalı', 'uv', 'upf', 'uv protection'],
  merserize: ['merserize', 'mercerized', 'mercerised'],
  sanforlu: ['sanforlu', 'sanfor', 'sanforized'],
  baskili: ['baskılı', 'baskı', 'printed', 'print', 'dijital baskı'],
  duz_boya: ['düz boya', 'düz boyalı', 'solid', 'dyed', 'boyalı', 'plain dyed'],
  melanj: ['melanj', 'melange', 'kırçıllı', 'heather'],
};

const USAGE_SYNONYMS: Record<string, readonly string[]> = {
  pantolonluk: ['pantolonluk', 'pantolon', 'trouser', 'trousers', 'pants'],
  taytlik: ['taytlık', 'tayt', 'legging', 'leggings'],
  tisortluk: ['tişörtlük', 'tişört', 't-shirt', 'tshirt', 'tee'],
  gomleklik: ['gömleklik', 'gömlek', 'shirt', 'shirting'],
  elbiselik: ['elbiselik', 'elbise', 'dress'],
  sweatshirt: ['sweatshirt', 'sweat', 'hoodie', 'kapüşonlu'],
  esofman: ['eşofman', 'jogger', 'tracksuit', 'eşofman altı'],
  mayoluk: ['mayoluk', 'mayo', 'bikini', 'swimwear', 'plaj'],
  spor_giyim: ['spor giyim', 'spor', 'sportswear', 'activewear', 'aktif giyim'],
  ic_giyim: ['iç giyim', 'iç çamaşırı', 'underwear', 'lingerie'],
  dis_giyim: ['dış giyim', 'mont', 'ceket', 'outerwear', 'jacket'],
  astar: ['astar', 'astarlık', 'lining'],
  cocuk_giyim: ['çocuk giyim', 'çocuk', 'bebek', 'kids', 'baby', 'babywear'],
  ev_tekstili: ['ev tekstili', 'perde', 'nevresim', 'home textile', 'curtain', 'bedding', 'döşemelik'],
};

const YARN_TYPE_SYNONYMS: Record<string, readonly string[]> = {
  penye: ['penye', 'ring', 'combed', 'ring iplik'],
  karde: ['karde', 'carded'],
  open_end: ['open end', 'open-end', 'openend', 'oe', 'rotor'],
  kompakt: ['kompakt', 'compact'],
  dty: ['dty', 'tekstüre'],
  fdy: ['fdy'],
  poy: ['poy'],
  vortex: ['vortex', 'mvs'],
};

// Katalog etiketleri de eşanlamlı sayılır ("Anti-pilling", "Peach (şeftali tuşe)" → "Peach").
function withLabels(base: Record<string, readonly string[]>, options: readonly { key: string; label: string }[]) {
  const out: Record<string, string[]> = {};
  for (const o of options) out[o.key] = [o.label.replace(/\s*\(.*\)\s*/, ''), ...(base[o.key] ?? [])];
  return out;
}

const FINISH_INDEX = buildIndex(withLabels(FINISH_SYNONYMS, FINISH_TAGS));
const USAGE_INDEX = buildIndex(withLabels(USAGE_SYNONYMS, USAGES));
const YARN_TYPE_INDEX = buildIndex(withLabels(YARN_TYPE_SYNONYMS, YARN_TYPES.filter((t) => t.key !== 'diger')));

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

function empty<T>(evidence: string | null = null): ExtractedField<T> {
  return { value: null, confidence: 0, evidence };
}

function clean(e: string | null | undefined, max = 300) {
  const t = (e ?? '').trim();
  return t ? t.slice(0, max) : null;
}

// Modelin "yok" demesinin çeşitli halleri.
const NULLISH = /^(null|none|yok|belirtilmemi[sş]|bilinmiyor|-|n\/a|)$/i;

function rawValue(f: RawField) {
  const v = clean(f.value);
  return v && !NULLISH.test(v) ? v : null;
}

// "a; b" ya da satır satır → parçalar
const splitList = (text: string, sep: RegExp) =>
  text
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);

type Reject = (field: ExtractionFieldName, reason: RejectedValue['reason'], value: unknown) => void;

export interface FinalizeOptions {
  hints?: { type?: ProductType };
}

export function finalizeExtraction(raw: RawExtraction, options: FinalizeOptions = {}): ExtractionResult {
  const rejected: RejectedValue[] = [];
  const warnings = { codes: [] as string[], notes: [] as string[] };
  const reject: Reject = (field, reason, value) => {
    rejected.push({ field, reason, raw: typeof value === 'string' ? value : JSON.stringify(value) });
  };

  // --- Çeşit / alt çeşit -----------------------------------------------------
  let type: ExtractedField<ProductType> = empty(clean(raw.type.evidence));
  const typeText = rawValue(raw.type);
  if (typeText) {
    const key = parseType(typeText);
    if (key) type = { value: key, confidence: clamp01(raw.type.confidence), evidence: clean(raw.type.evidence) };
    else reject('type', 'invalid_value', typeText);
  }

  let subtype: ExtractedField<string> = empty(clean(raw.subtype.evidence));
  const subtypeText = rawValue(raw.subtype);
  if (subtypeText) {
    const knit = matchKnit(subtypeText);
    if (knit.subtype) {
      subtype = {
        value: knit.subtype,
        confidence: clamp01(raw.subtype.confidence) * knit.confidence,
        evidence: clean(raw.subtype.evidence) ?? subtypeText,
      };
      const derived = typeOfSubtype(knit.subtype);
      // Alt çeşit çeşitten daha özgül: çelişirse alt çeşidin çeşidi kazanır.
      if (derived && type.value !== derived) {
        type = { value: derived, confidence: Math.max(type.confidence, subtype.confidence), evidence: subtype.evidence };
      }
    } else {
      // Alt çeşit yazmıyor ama çeşit adı yazıyorsa ("örme kumaş") çeşidi destekler.
      if (knit.type && !type.value) {
        type = { value: knit.type, confidence: clamp01(raw.subtype.confidence) * knit.confidence, evidence: clean(raw.subtype.evidence) };
      }
      reject('subtype', 'unknown_subtype', subtypeText);
    }
  }

  // Kullanıcının formda seçtiği çeşide ait olmayan alt çeşit aktarılmaz.
  if (options.hints?.type && subtype.value && typeOfSubtype(subtype.value) !== options.hints.type) {
    reject('subtype', 'subtype_not_in_type', subtype.value);
    subtype = empty(subtype.evidence);
  }

  // --- Kod ----------------------------------------------------------------------
  let code: ExtractedField<string> = empty(clean(raw.code.evidence));
  const codeText = rawValue(raw.code);
  if (codeText) {
    const c = codeText.replace(/^(kod|code|art(?:ikel)?\.?(?:\s*no)?|kalite)[:.\s#-]*/i, '').trim().slice(0, 40);
    if (/[a-z0-9]/i.test(c)) code = { value: c, confidence: clamp01(raw.code.confidence), evidence: clean(raw.code.evidence) };
    else reject('code', 'invalid_value', codeText);
  }

  // --- Kompozisyon ---------------------------------------------------------------
  let composition: ExtractedField<CompositionItem[]> = empty(clean(raw.composition.evidence));
  const compText = rawValue(raw.composition);
  if (compText) {
    const parsed = parseComposition(compText);
    for (const u of parsed.unknown) reject('composition', 'unknown_fiber', u);
    if (parsed.items.length > 0) {
      let confidence = clamp01(raw.composition.confidence) * parsed.confidence;
      const evidence = clean(raw.composition.evidence) ?? compText;
      // Kanıt metni de aynı satırları veriyorsa (etikette birebir yazıyor) kısaltma
      // belirsizliği kalkar.
      const fromEvidence = parseComposition(evidence);
      if (fromEvidence.items.length > 0 && sameComposition(fromEvidence.items, parsed.items)) {
        confidence = Math.max(confidence, CORROBORATED_CONFIDENCE);
      }
      composition = { value: parsed.items.map((i) => ({ fiber: i.fiber, percent: round1(i.percent) })), confidence, evidence };
    } else {
      reject('composition', 'invalid_value', compText);
    }
  }

  // --- Gramaj / en ------------------------------------------------------------------
  const weightGsm = numberField(raw.weightGsm, 'gsm', 'weightGsm', reject);
  const widthCm = numberField(raw.widthCm, 'widthCm', 'widthCm', reject);

  let widthType: ExtractedField<WidthType> = empty(clean(raw.widthType.evidence));
  const widthTypeText = rawValue(raw.widthType);
  if (widthTypeText) {
    const wt = parseWidthType(widthTypeText);
    if (wt) widthType = { value: wt, confidence: clamp01(raw.widthType.confidence), evidence: clean(raw.widthType.evidence) };
    else reject('widthType', 'invalid_value', widthTypeText);
  }

  // --- İplik ---------------------------------------------------------------------------
  let yarns: ExtractedField<ExtractedYarn[]> = empty(clean(raw.yarns.evidence));
  const yarnText = rawValue(raw.yarns);
  if (yarnText) {
    const items: ExtractedYarn[] = [];
    for (const segment of splitList(yarnText, /[;\n]+/)) {
      const parsed = parseMeasures(segment).yarns[0];
      if (!parsed) {
        reject('yarns', 'unknown_yarn_unit', segment);
        continue;
      }
      const yarnType = matchTerm(parsed.yarnType ?? segment, YARN_TYPE_INDEX)?.key ?? findTerms(segment, YARN_TYPE_INDEX)[0]?.key ?? '';
      items.push({ role: '', count: parsed.count, unit: parsed.unit, ply: Math.min(6, Math.max(1, Math.round(parsed.ply || 1))), yarnType });
      if (items.length === 6) break;
    }
    if (items.length > 0) yarns = { value: items, confidence: clamp01(raw.yarns.confidence), evidence: clean(raw.yarns.evidence) ?? yarnText };
  }

  // --- Sertifikalar ------------------------------------------------------------------------
  let certificates: ExtractedField<ExtractedCertificate[]> = empty(clean(raw.certificates.evidence));
  const certText = rawValue(raw.certificates);
  if (certText) {
    const items: ExtractedCertificate[] = [];
    const seen = new Set<string>();
    for (const segment of splitList(certText, /[;\n]+/)) {
      const cert = parseCertificate(segment);
      if (!cert) {
        reject('certificates', 'unknown_certificate', segment);
        continue;
      }
      if (seen.has(cert.name)) continue;
      seen.add(cert.name);
      items.push(cert);
      if (items.length === 10) break;
    }
    if (items.length > 0) {
      certificates = { value: items, confidence: clamp01(raw.certificates.confidence), evidence: clean(raw.certificates.evidence) ?? certText };
    }
  }

  // --- Apre / kullanım -------------------------------------------------------------------------
  const finishTags = keyListField(raw.finishTags, FINISH_INDEX, 'finishTags', reject);
  const usages = keyListField(raw.usages, USAGE_INDEX, 'usages', reject);

  // --- Makullük (kayıt engellenmez; güven düşer, uyarı döner) ---------------------------------------
  if (type.value) {
    const report = checkPassport({
      type: type.value,
      subtype: subtype.value,
      weightGsm: weightGsm.value,
      widthCm: widthCm.value,
      composition: composition.value ?? undefined,
    });
    report.flags.forEach((flag, i) => {
      if (flag === 'unknown_subtype') {
        // Alt çeşit çeşide ait değil: aktarılmaz, uyarıya da yazılmaz (rejected'da).
        reject('subtype', 'subtype_not_in_type', subtype.value ?? '');
        subtype = empty(subtype.evidence);
        return;
      }
      if (flag === 'gsm_low' || flag === 'gsm_high') weightGsm.confidence *= 0.6;
      else if (flag === 'width_low' || flag === 'width_high') widthCm.confidence *= 0.6;
      else if (flag === 'composition_total_not_100' || flag === 'fiber_percent_high') composition.confidence *= 0.7;
      warnings.codes.push(flag);
      warnings.notes.push(report.notes[i]);
    });
  }
  // Aralık içinde ama alışılmış bandın (145-165) dışında: sessizce biraz daha az güven.
  if (widthCm.value != null && (widthCm.value < TYPICAL_WIDTH.min || widthCm.value > TYPICAL_WIDTH.max)) {
    widthCm.confidence *= 0.9;
  }

  const extraction: Extraction = {
    type,
    subtype,
    code,
    composition,
    weightGsm,
    widthCm,
    widthType,
    yarns,
    certificates,
    finishTags,
    usages,
    notes: (raw.notes ?? '').trim().slice(0, 600),
  };

  // --- Eşik: düşük güvenli alan forma aktarılmaz -----------------------------------------------------------
  for (const name of Object.keys(extraction) as (keyof Extraction)[]) {
    if (name === 'notes') continue;
    const f = extraction[name] as ExtractedField<unknown>;
    f.confidence = Math.round(clamp01(f.confidence) * 100) / 100;
    if (f.value != null && f.confidence < MIN_CONFIDENCE) {
      reject(name, 'low_confidence', f.value);
      f.value = null;
    }
  }

  return { extraction, warnings, rejected };
}

// ---------------------------------------------------------------------------

function parseType(text: string): ProductType | null {
  const t = text.trim().toLowerCase();
  if ((PRODUCT_TYPES as readonly string[]).includes(t)) return t as ProductType;
  const m = matchTerm(text, TYPE_INDEX);
  if (m) return m.key as ProductType;
  // "Knit (Single Jersey)" gibi: alt çeşitten türet
  return matchKnit(text).type;
}

// "180", "180 gr/m2", "180,5" → sayı; ölçü ayrıştırıcısı önce, çıplak sayı sonra.
function readNumber(text: string, measure: 'gsm' | 'widthCm'): number | null {
  const parsed = parseMeasures(text)[measure];
  if (parsed != null) return parsed;
  const m = text.replace(',', '.').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function numberField(raw: RawField, measure: 'gsm' | 'widthCm', field: ExtractionFieldName, reject: Reject): ExtractedField<number> {
  const evidence = clean(raw.evidence);
  const text = rawValue(raw);
  if (!text) return empty(evidence);
  const value = readNumber(text, measure);
  if (value == null || value <= 0) {
    reject(field, 'invalid_value', text);
    return empty(evidence);
  }
  let confidence = clamp01(raw.confidence);
  if (evidence) {
    const fromEvidence = parseMeasures(evidence)[measure];
    if (fromEvidence != null) {
      // Kanıt aynı sayıyı veriyorsa doğrulanmış; farklı sayı veriyorsa model
      // muhtemelen yanlış okudu ya da birim çevirdi.
      confidence = fromEvidence === value ? Math.max(confidence, CORROBORATED_CONFIDENCE) : confidence * 0.6;
    }
  }
  return { value: round1(value), confidence, evidence: evidence ?? text };
}

function keyListField(raw: RawField, index: SynonymIndex, field: ExtractionFieldName, reject: Reject): ExtractedField<string[]> {
  const evidence = clean(raw.evidence);
  const text = rawValue(raw);
  if (!text) return empty(evidence);
  const keys = new Set<string>();
  for (const part of splitList(text, /[,;\n/]+/)) {
    const m = matchTerm(part, index);
    if (m) keys.add(m.key);
    else reject(field, 'invalid_value', part);
  }
  if (keys.size === 0) return empty(evidence);
  return { value: [...keys], confidence: clamp01(raw.confidence), evidence: evidence ?? text };
}

// "OEKO-TEX Standard 100 | 20.HTR.98765 | 2027-03-01" ya da serbest
// "OEKO-TEX Standard 100 No: 20.HTR.98765 (03/2027)".
function parseCertificate(segment: string): ExtractedCertificate | null {
  const parts = segment.split('|').map((s) => s.trim());
  const name = matchCertificate(parts[0]) ?? matchCertificate(segment);
  if (!name) return null;
  let number = parts[1] ?? '';
  let validUntil: string | null = parts.length > 2 ? isoDateOrNull(parts[2]) : null;
  if (parts.length === 1) {
    const num = segment.match(/\b(?:no|nr|number|numara|sertifika no)[:.\s]*([A-Z0-9][A-Z0-9.\-/]{3,})/i);
    number = num?.[1] ?? '';
    validUntil = isoDateOrNull(segment.match(/\b(\d{4}-\d{2}-\d{2}|\d{2}[./]\d{2}[./]\d{4})\b/)?.[1]);
  }
  return { name: name.key, number: number.slice(0, 80), validUntil };
}

function sameComposition(a: readonly CompositionItem[], b: readonly CompositionItem[]) {
  if (a.length !== b.length) return false;
  const map = new Map(a.map((i) => [i.fiber, round1(i.percent)]));
  return b.every((i) => map.get(i.fiber) === round1(i.percent));
}

// "2027-03-01" ya da "01.03.2027" / "01/03/2027" → ISO; başka biçim null.
function isoDateOrNull(value: string | null | undefined) {
  if (!value) return null;
  let t = value.trim();
  const dmy = t.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  if (dmy) t = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(`${t}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : t;
}
