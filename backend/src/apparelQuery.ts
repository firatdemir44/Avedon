import { fold } from './domain/glossary/normalize';
import { cityFromWord } from './cities';

// Konfeksiyon araması (docs/konfeksiyon-plani.md Bölüm B, madde 5): serbest metinden süzgeç.
// Makine aramasındaki parseMachineQuery ile aynı yöntem: metin `fold` ile katlanır
// (Türkçe harf/büyük-küçük farkı gider), sözcükler tek tek sınıflanır.
// Örn. "tayt aylık 50 bin oeko-tex" → grup tayt, kapasite ≥ 50.000, OEKO-TEX;
// "sütyen atölyesi bursa" → grup sütyen, atölye, Bursa.
//
// Sayıların okunuşu:
// - "gün" birimli sayı → en fazla termin (leadMax): "30 günde", "termin 20 gün".
// - önünde moq / min / minimum / "en az" ya da ardında "sipariş" olan sayı → en fazla MOQ
//   (moqMax). Okuma: kullanıcı KENDİ sipariş adedini söylüyor; bu adedi kabul eden, yani
//   model başı MOQ'su bu sayıdan büyük olmayan firmalar aranır ("en az 500 adet sipariş"
//   → MOQ ≤ 500).
// - önünde aylık / ayda / kapasite olan, ardında "bin/k/milyon" ya da "adet" gelen ya da
//   1.000 ve üzeri sayı → en az aylık kapasite (capacityMin). "aylık" açıkça yazılmışsa
//   "en az" olsa da kapasite sayılır ("aylık en az 50 bin").
// - bağlamsız küçük sayı (< 1.000) yok sayılır.

export type ApparelKind = 'koleksiyon' | 'atolye';

export interface ApparelQuery {
  group: string | null;
  kind: ApparelKind | null;
  capacityMin: number | null;
  moqMax: number | null;
  leadMax: number | null;
  cert: string | null;
  /** Hizmet ya da atölye işlemi anahtarı. */
  service: string | null;
  city: string | null;
  /** Hiçbir süzgece girmeyen sözcükler (firma adı araması için). */
  rest: string[];
}

export const EMPTY_APPAREL_QUERY: ApparelQuery = {
  group: null,
  kind: null,
  capacityMin: null,
  moqMax: null,
  leadMax: null,
  cert: null,
  service: null,
  city: null,
  rest: [],
};

// Çok sözcüklü kalıplar önce birleştirilir (katlanmış yazımla).
const PHRASES: [RegExp, string][] = [
  [/\boeko ?tex( standard)?( 100)?\b/g, 'oekotex'],
  [/\biso ?9001\b/g, 'iso9001'],
  [/\bic camasir(i|lari|lar)?\b/g, 'iccamasiri'],
  [/\bic giyim\b/g, 'iccamasiri'],
  [/\bt ?shirt(s|ler)?\b/g, 'tshirt'],
  [/\baktif spor( giyim)?\b/g, 'aktifspor'],
  [/\bspor giyim\b/g, 'aktifspor'],
  [/\bev giyim(i)?\b/g, 'evgiyim'],
  [/\bdis giyim\b/g, 'disgiyim'],
  [/\bgece elbise(si|leri)?\b/g, 'abiye'],
  [/\butu ?(ve )?paket(leme)?\b/g, 'utupaket'],
  [/\bkalite kontrol\b/g, 'kalitekontrol'],
  [/\ben az\b/g, 'enaz'],
  [/\ben fazla\b/g, 'enfazla'],
  [/\bmin\.? siparis\b/g, 'moq'],
  [/\bminimum siparis\b/g, 'moq'],
];

const GROUP_WORDS: Record<string, string[]> = {
  ic_camasiri: ['iccamasiri', 'camasir', 'camasiri', 'kulot', 'boxer', 'lingerie', 'underwear', 'atlet'],
  sutyen: ['sutyen', 'bra', 'bralet', 'korse', 'korsa', 'sutyan'],
  mayo: ['mayo', 'bikini', 'plaj', 'swimwear'],
  tisort: ['tisort', 'tshirt', 'tsirt', 'basic', 'basik'],
  sweatshirt: ['sweat', 'sweatshirt', 'esofman', 'hoodie', 'kapsonlu'],
  aktif_spor: ['aktifspor', 'spor', 'activewear', 'sportswear', 'sporwear'],
  tayt: ['tayt', 'tayit', 'legging', 'leggings', 'tights'],
  pijama: ['pijama', 'evgiyim', 'homewear', 'gecelik'],
  cocuk: ['cocuk', 'bebek', 'kids', 'baby'],
  gomlek: ['gomlek', 'shirt'],
  pantolon: ['pantolon', 'pantalon', 'denim', 'jean', 'jeans', 'kot'],
  dis_giyim: ['disgiyim', 'mont', 'kaban', 'ceket', 'parka', 'outerwear'],
  abiye: ['abiye', 'elbise', 'dress'],
  triko: ['triko', 'kazak', 'hirka', 'knitwear'],
};

const KIND_WORDS: Record<ApparelKind, string[]> = {
  atolye: ['atolye', 'atelye', 'fason', 'fasoncu', 'imalatci'],
  koleksiyon: ['koleksiyon', 'koleksiyoncu', 'marka'],
};

const CERT_WORDS: Record<string, string[]> = {
  oeko_tex_100: ['oekotex', 'oeko'],
  gots: ['gots'],
  grs: ['grs'],
  bsci: ['bsci', 'amfori'],
  sedex: ['sedex', 'smeta'],
  iso_9001: ['iso9001'],
};

// Hizmetler ve atölye işlemleri aynı süzgeçte (arama ikisine de bakar).
const SERVICE_WORDS: Record<string, string[]> = {
  baski: ['baski', 'baskili', 'print'],
  nakis: ['nakis', 'nakisli', 'embroidery'],
  yikama: ['yikama', 'yikamali'],
  utu_paket: ['utupaket', 'utu', 'paketleme'],
  kesim: ['kesim'],
  dikim: ['dikim'],
  modelhane: ['modelhane', 'kalip', 'kalipci', 'modelist'],
  overlok_recme: ['overlok', 'recme'],
  kalite_kontrol: ['kalitekontrol'],
};

const CAPACITY_WORDS = new Set(['aylik', 'ayda', 'kapasite', 'kapasiteli', 'kapasitesi']);
const MOQ_WORDS = new Set(['moq', 'min', 'minimum', 'enaz', 'asgari']);
const LEAD_WORDS = new Set(['termin', 'teslim', 'teslimat']);
const DAY_UNITS = new Set(['gun', 'gunde', 'gunluk', 'gunu', 'days', 'day']);
const THOUSAND = new Set(['bin', 'k', 'b']);
const MILLION = new Set(['milyon', 'm', 'mn']);
const PIECE = new Set(['adet', 'parca', 'pcs', 'pieces']);
const ORDER_WORDS = new Set(['siparis', 'siparisi', 'order']);
// Anlamsız bağlaç / dolgu sözcükleri: firma adı araması boşuna yapılmasın.
const STOP_WORDS = new Set([
  've', 'ile', 'icin', 'olan', 'yapan', 'ureten', 'uretimi', 'uretim', 'uretici', 'firma', 'firmasi', 'firmalar',
  'ariyorum', 'lazim', 'gerek', 'bul', 'var', 'mi', 'mu', 'bir', 'en', 'fazla', 'enfazla', 'konfeksiyon', 'konfeksiyoncu',
  'adet', 'ay', 'da', 'de', 'belgeli', 'sertifikali', 'sertifika', 'hizmeti', 'yapabilen', 'calisan', 'the', 'for',
]);

function buildIndex(table: Record<string, string[]>) {
  const map = new Map<string, string>();
  for (const [key, words] of Object.entries(table)) for (const w of words) map.set(w, key);
  return map;
}
const GROUP_INDEX = buildIndex(GROUP_WORDS);
const KIND_INDEX = buildIndex(KIND_WORDS);
const CERT_INDEX = buildIndex(CERT_WORDS);
const SERVICE_INDEX = buildIndex(SERVICE_WORDS);

// Çoğul ve iyelik ekleri: "taytlar", "sütyenleri", "atölyesi", "atölyeleri".
function stems(word: string): string[] {
  const out = [word];
  const add = (s: string) => {
    if (s.length >= 3 && !out.includes(s)) out.push(s);
  };
  add(word.replace(/(lar|ler)(i|in|ı)?$/, ''));
  add(word.replace(/(si|su|leri|lari)$/, ''));
  add(word.replace(/(ci|cu|cilar|ciler)$/, ''));
  add(word.replace(/[iu]$/, ''));
  return out;
}

// Tek harf yazım hatası (≥ 5 harfli sözcüklerde): "sütyn", "pijma", "esofmam".
function within1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function lookup(index: Map<string, string>, word: string, fuzzy: boolean): string | null {
  for (const s of stems(word)) if (index.has(s)) return index.get(s)!;
  if (!fuzzy || word.length < 5) return null;
  for (const [w, key] of index) if (w.length >= 5 && within1(word, w)) return key;
  return null;
}

// "50.000" → 50000, "1,5" → 1.5, "50" → 50; sayı değilse null.
function readNumber(token: string): number | null {
  if (/^\d{1,3}(\.\d{3})+$/.test(token)) return Number(token.replace(/\./g, ''));
  if (/^\d+([.,]\d+)?$/.test(token)) return Number(token.replace(',', '.'));
  return null;
}

function classifyWord(q: ApparelQuery, token: string, fuzzy: boolean): boolean {
  const group = lookup(GROUP_INDEX, token, fuzzy);
  if (group) {
    q.group ??= group;
    return true;
  }
  const kind = lookup(KIND_INDEX, token, fuzzy) as ApparelKind | null;
  if (kind) {
    q.kind ??= kind;
    return true;
  }
  if (fuzzy) return false;
  const cert = lookup(CERT_INDEX, token, false);
  if (cert) {
    q.cert ??= cert;
    return true;
  }
  const service = lookup(SERVICE_INDEX, token, false);
  if (service) {
    q.service ??= service;
    return true;
  }
  return false;
}

export function parseApparelQuery(input: string): ApparelQuery {
  // Tire ve kesme işareti ayraç sayılır ("oeko-tex", "t-shirt", "Bursa'da"); "50k" gibi
  // bitişik birim ayrılır; "/ay" "ay" olur.
  let text = fold(input.replace(/['’]/g, '')).replace(/-/g, ' ').replace(/\//g, ' ');
  text = text.replace(/(\d)(k|bin|m|gun|gunde|adet)\b/g, '$1 $2');
  text = text.replace(/,(?!\d)/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [re, rep] of PHRASES) text = text.replace(re, rep);
  const tokens = text.split(' ').filter(Boolean);

  const q: ApparelQuery = { ...EMPTY_APPAREL_QUERY, rest: [] };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const n = readNumber(token);
    if (n != null) {
      let value = n;
      let j = i + 1;
      let scaled = false;
      if (tokens[j] && THOUSAND.has(tokens[j])) {
        value *= 1000;
        scaled = true;
        j++;
      } else if (tokens[j] && MILLION.has(tokens[j])) {
        value *= 1_000_000;
        scaled = true;
        j++;
      }
      value = Math.round(value);
      const next = tokens[j];
      const prev = [tokens[i - 1], tokens[i - 2]].filter(Boolean);
      const after = tokens.slice(j, j + 3);
      if (next && DAY_UNITS.has(next)) {
        q.leadMax = value;
        i = j;
        continue;
      }
      const capacityCtx = prev.some((p) => CAPACITY_WORDS.has(p)) || next === 'ay' || next === 'aylik' || next === 'ayda';
      const moqCtx = prev.some((p) => MOQ_WORDS.has(p)) || after.some((a) => ORDER_WORDS.has(a));
      const leadCtx = prev.some((p) => LEAD_WORDS.has(p));
      let consumed = j - 1;
      if (next && PIECE.has(next)) consumed = j;
      if (tokens[consumed + 1] && ORDER_WORDS.has(tokens[consumed + 1]) && moqCtx && !capacityCtx) consumed++;
      if (next === 'ay' || next === 'ayda' || next === 'aylik') consumed = j;
      if (leadCtx && !capacityCtx && !moqCtx && value <= 365) q.leadMax = value;
      else if (capacityCtx) q.capacityMin = value;
      else if (moqCtx) q.moqMax = value;
      else if (scaled || (next && PIECE.has(next)) || value >= 1000) q.capacityMin = value;
      i = consumed;
      continue;
    }
    // Önce birebir (ekleriyle) eşleşme; yazım hatası toleransı en sonda, il adları yutulmasın.
    if (classifyWord(q, token, false)) continue;
    const city = cityFromWord(token);
    if (city) {
      q.city ??= city;
      continue;
    }
    if (STOP_WORDS.has(token) || CAPACITY_WORDS.has(token) || MOQ_WORDS.has(token) || LEAD_WORDS.has(token) || DAY_UNITS.has(token) || PIECE.has(token) || ORDER_WORDS.has(token) || THOUSAND.has(token)) continue;
    if (classifyWord(q, token, true)) continue;
    if (token.length >= 2) q.rest.push(token);
  }
  return q;
}

/** Metinden en az bir yapısal süzgeç çıktı mı (genel aramada konfeksiyon grubunu açmak için). */
export function hasApparelSignal(q: ApparelQuery): boolean {
  return q.group != null || q.kind != null;
}
