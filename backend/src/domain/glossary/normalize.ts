// Sözlük katmanının ortak yardımcıları (Faz 1, Adım 1). Tüm eşleştirmeler
// burada aynı biçimde normalize edilir: Türkçe küçük harf, aksan katlama
// (ş→s, ü→u ...), noktalama temizliği. Böylece "SÜPREM", "suprem" ve "Süprem"
// aynı anahtara gider.

export interface TermMatch {
  key: string;
  // 1: tam eşanlamlı eşleşmesi · 0.7: kısaltma (CO, EA gibi belirsiz olabilir)
  confidence: number;
  matchedText: string;
  // Kelime dizisindeki konum (n-gram başlangıcı ve uzunluğu).
  start: number;
  length: number;
}

export interface SynonymIndex {
  // normalize edilmiş eşanlamlı → anahtar
  map: Map<string, string>;
  // en uzun eşanlamlının kelime sayısı (n-gram taramasının üst sınırı)
  maxWords: number;
  // Serbest metinde başka anlama gelebilecek kısaltmalar (CO, EA, PES ...),
  // katlanmış halleriyle. Listede olmayan her terim gerçek ad sayılır ("yün",
  // "kot", "GRS"). Kısaltma eşleşmeleri 0,7 güvenle döner ve yalnızca
  // allowAbbreviations ile (kompozisyon bağlamı) kabul edilir.
  abbreviations: Set<string>;
}

const FOLD: Record<string, string> = {
  ş: 's',
  ç: 'c',
  ğ: 'g',
  ü: 'u',
  ö: 'o',
  ı: 'i',
  i̇: 'i',
  â: 'a',
  î: 'i',
  û: 'u',
  é: 'e',
};

export function trLower(value: string) {
  return value.toLocaleLowerCase('tr-TR');
}

// Aksanları katlar, harf/rakam dışını boşluğa çevirir, boşlukları sıkıştırır.
// "%" ve "/" korunur: kompozisyon ayrıştırıcısı onlara bakıyor.
export function fold(value: string) {
  return trLower(value)
    .normalize('NFC')
    .replace(/[şçğüöıi̇âîûé]/g, (ch) => FOLD[ch] ?? ch)
    .replace(/[^a-z0-9%/.,\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Kelimelere böler; "%95" ve "95%" tek parça kalır, "95/5" ve "co/ea" bölünür.
export function tokenize(value: string): string[] {
  return fold(value)
    .replace(/\//g, ' / ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/^[.,-]+|[.,-]+$/g, ''))
    .filter(Boolean);
}

export function buildIndex(
  table: Record<string, readonly string[]>,
  options: { abbreviations?: readonly string[] } = {}
): SynonymIndex {
  const map = new Map<string, string>();
  let maxWords = 1;
  for (const [key, synonyms] of Object.entries(table)) {
    for (const synonym of [key, ...synonyms]) {
      const folded = fold(synonym);
      if (!folded) continue;
      // Aynı yazım iki anahtara gidiyorsa ilk tanım kazanır (tablolarda
      // öncelik sırası bilinçli). Test dosyası çakışmaları listeler.
      if (!map.has(folded)) map.set(folded, key);
      maxWords = Math.max(maxWords, folded.split(' ').length);
    }
  }
  return { map, maxWords, abbreviations: new Set((options.abbreviations ?? []).map(fold)) };
}

export function isAbbreviation(index: SynonymIndex, term: string) {
  return index.abbreviations.has(term);
}

// Metindeki tüm eşanlamlı eşleşmeleri, en uzun n-gram önce olmak üzere.
// Çakışan eşleşmelerde uzun olan kazanır ("single jersey" > "jersey").
export function findTerms(text: string, index: SynonymIndex, options: { allowAbbreviations?: boolean } = {}): TermMatch[] {
  const tokens = tokenize(text);
  const taken = new Array<boolean>(tokens.length).fill(false);
  const matches: TermMatch[] = [];
  for (let size = index.maxWords; size >= 1; size--) {
    for (let start = 0; start + size <= tokens.length; start++) {
      if (taken.slice(start, start + size).some(Boolean)) continue;
      const phrase = tokens.slice(start, start + size).join(' ');
      const key = index.map.get(phrase);
      if (!key) continue;
      const abbreviation = size === 1 && isAbbreviation(index, phrase);
      if (abbreviation && !options.allowAbbreviations) continue;
      matches.push({ key, confidence: abbreviation ? 0.7 : 1, matchedText: phrase, start, length: size });
      for (let i = start; i < start + size; i++) taken[i] = true;
    }
  }
  return matches.sort((a, b) => a.start - b.start);
}

// Tek bir terim (ör. bir çip etiketi) için en iyi eşleşme.
export function matchTerm(text: string, index: SynonymIndex): TermMatch | null {
  const folded = fold(text);
  const key = index.map.get(folded);
  if (key) {
    const abbreviation = isAbbreviation(index, folded);
    return { key, confidence: abbreviation ? 0.7 : 1, matchedText: folded, start: 0, length: 1 };
  }
  const found = findTerms(text, index, { allowAbbreviations: true });
  return found[0] ?? null;
}
