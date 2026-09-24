// Sayfadan okunan ham değerleri Takyon ürün modeline çevirir (çeşit, alt çeşit,
// kullanım anahtarları, kompozisyon). Kaydetmez.
import { PRODUCT_TYPES, SUBTYPES, TYPE_LABELS, USAGES, type ProductType } from '../catalog';
import { findTerms, fold, parseComposition, SUBTYPE_INDEX, typeOfSubtype } from '../domain/glossary';
import { COMPOSITION_AUTOPARSE_MIN_CONFIDENCE } from '../passport';
import type { ParsedProductPage } from './parse';

export interface ImportItem {
  key: string;
  code: string;
  name: string;
  type: ProductType | null;
  subtype: string;
  weightGsm: number | null;
  widthCm: number | null;
  compositionText: string;
  usages: string[];
  // Karşılığı olmayan kullanım etiketleri (ürün notuna yazılır)
  unmappedUses: string[];
  imageUrls: string[];
  images: { url: string; smallUrl: string | null }[];
  sourceUrl: string;
  exists: boolean;
  // Aynı kod listede daha önce geçti (yalnızca ilki eklenir)
  duplicate?: boolean;
  // Hangi alanlar yapay zekâ yedeğinden geldi (fieldMeta güveni için)
  llmFields: string[];
  warnings: string[];
  // Dosyadan aktarımda fiyat/stok/MOQ/termin (web sayfalarında genelde yok).
  commerce: ImportCommerce;
}

export interface ImportCommerce {
  priceValue: number | null;
  priceCurrency: '' | 'TRY' | 'USD' | 'EUR';
  priceUnit: '' | 'm' | 'kg';
  stock: number | null;
  stockUnit: 'm' | 'kg';
  moq: number | null;
  leadTimeDays: number | null;
}

export const EMPTY_COMMERCE: ImportCommerce = { priceValue: null, priceCurrency: '', priceUnit: '', stock: null, stockUnit: 'm', moq: null, leadTimeDays: null };

// Sitedeki "Product Type" metni → çeşit. Sıra önemli: "raschel lace" dantel değil raschel.
const TYPE_RULES: [RegExp, ProductType][] = [
  [/rasc?hel|rasel/i, 'raschel'],
  [/lace|dantel|guipure|gipür/i, 'dantel'],
  [/knitwear|triko|sweater/i, 'triko'],
  [/woven|dokuma/i, 'dokuma'],
  [/knit|örme|orme|jersey|circular/i, 'orme'],
];

export function mapType(text: string): ProductType | null {
  for (const [re, type] of TYPE_RULES) if (re.test(text)) return type;
  return null;
}

// Aynı yazım farklı çeşitte başka anahtara gidebilir (velvet: dokumada kadife, örmede örme kadife).
const CROSS_TYPE: Record<string, Partial<Record<ProductType, string>>> = {
  kadife: { orme: 'kadife_orme' },
  kadife_orme: { dokuma: 'kadife' },
};

export function mapSubtype(name: string, type: ProductType | null): { subtype: string; inferredType: ProductType | null } {
  const matches = findTerms(name, SUBTYPE_INDEX);
  // Etiketin kendisi de denenir ("Süprem", "Pike Lakost").
  const folded = fold(name);
  for (const t of PRODUCT_TYPES) {
    for (const s of SUBTYPES[t]) {
      if (folded.includes(fold(s.label)) && !matches.some((m) => m.key === s.key)) {
        matches.push({ key: s.key, confidence: 1, matchedText: s.label, start: 0, length: 1 });
      }
    }
  }
  if (!matches.length) return { subtype: '', inferredType: null };
  if (type) {
    const inType = matches.find((m) => SUBTYPES[type].some((s) => s.key === m.key));
    if (inType) return { subtype: inType.key, inferredType: type };
    for (const m of matches) {
      const alt = CROSS_TYPE[m.key]?.[type];
      if (alt) return { subtype: alt, inferredType: type };
    }
    return { subtype: '', inferredType: type };
  }
  const first = matches[0];
  return { subtype: first.key, inferredType: typeOfSubtype(first.key) };
}

// Sitedeki kullanım etiketleri (EN/TR) → USAGES anahtarları.
const USE_RULES: [RegExp, string][] = [
  [/^(sports?|active(wear)?|fitness|athleisure|spor( giyim)?|yoga|running|outdoor sports?)$/i, 'spor_giyim'],
  [/(swim|beach|mayo|bikini)/i, 'mayoluk'],
  [/(lingerie|underwear|intimate|iç giyim|ic giyim|nightwear|sleepwear|pijama)/i, 'ic_giyim'],
  [/(legging|tayt|tights)/i, 'taytlik'],
  [/(t-?shirt|tee|tişört|tisort)/i, 'tisortluk'],
  [/(shirt|gömlek|gomlek|blouse|bluz)/i, 'gomleklik'],
  [/(dress|elbise)/i, 'elbiselik'],
  [/(trouser|pants|pantolon)/i, 'pantolonluk'],
  [/(sweatshirt|hoodie)/i, 'sweatshirt'],
  [/(tracksuit|jogger|eşofman|esofman)/i, 'esofman'],
  [/(outerwear|jacket|coat|dış giyim|dis giyim|mont|ceket)/i, 'dis_giyim'],
  [/(lining|astar)/i, 'astar'],
  [/(kids|children|baby|çocuk|cocuk|bebek)/i, 'cocuk_giyim'],
  [/(home|bedding|upholstery|curtain|ev tekstil|döşeme|perde)/i, 'ev_tekstili'],
];

export function mapUsages(uses: readonly string[]): { usages: string[]; unmapped: string[] } {
  const usages = new Set<string>();
  const unmapped: string[] = [];
  for (const raw of uses) {
    const u = raw.trim();
    const label = USAGES.find((x) => fold(x.label) === fold(u));
    if (label) {
      usages.add(label.key);
      continue;
    }
    const rule = USE_RULES.find(([re]) => re.test(u));
    if (rule) usages.add(rule[1]);
    else unmapped.push(u);
  }
  return { usages: [...usages], unmapped };
}

export function mapParsed(parsed: ParsedProductPage, sourceUrl: string, key: string): ImportItem {
  const warnings: string[] = [];
  let type = mapType(parsed.typeText);
  const sub = mapSubtype(parsed.name, type);
  if (!type && sub.inferredType) type = sub.inferredType;
  const { usages, unmapped } = mapUsages(parsed.uses);

  if (!parsed.code) warnings.push('Ürün kodu bulunamadı');
  if (!type) warnings.push(parsed.typeText ? `Kumaş çeşidi tanınmadı: ${parsed.typeText}` : 'Kumaş çeşidi bulunamadı');
  if (parsed.weightGsm === null) warnings.push('Gramaj bulunamadı');
  if (parsed.widthCm === null) warnings.push('En bulunamadı');
  if (!parsed.compositionText) warnings.push('İçerik bulunamadı');
  else {
    const comp = parseComposition(parsed.compositionText);
    if (!comp.items.length || comp.confidence < COMPOSITION_AUTOPARSE_MIN_CONFIDENCE) warnings.push('İçerik tam okunamadı');
  }
  if (!parsed.images.length) warnings.push('Fotoğraf bulunamadı');

  return {
    key,
    code: parsed.code,
    name: parsed.name,
    type,
    subtype: sub.subtype,
    weightGsm: parsed.weightGsm,
    widthCm: parsed.widthCm,
    compositionText: parsed.compositionText,
    usages,
    unmappedUses: unmapped,
    imageUrls: parsed.images.map((i) => i.smallUrl ?? i.url),
    images: parsed.images,
    sourceUrl,
    exists: false,
    llmFields: [],
    warnings,
    commerce: { ...EMPTY_COMMERCE },
  };
}

// Kaydedilebilir mi? Ürün modeli kod, çeşit, gramaj, en ve içerik ister.
export function missingRequired(item: ImportItem): string[] {
  const missing: string[] = [];
  if (!item.code) missing.push('code');
  if (!item.type) missing.push('type');
  if (!item.weightGsm) missing.push('weightGsm');
  if (!item.widthCm) missing.push('widthCm');
  if (!item.compositionText) missing.push('composition');
  return missing;
}

// Ürün notu (useArea, en çok 200): ad + karşılığı olmayan kullanım etiketleri.
export function buildNote(item: Pick<ImportItem, 'name' | 'unmappedUses'>) {
  const parts = [item.name, item.unmappedUses.length ? `Kullanım: ${item.unmappedUses.join(', ')}` : ''].filter(Boolean);
  return parts.join(' · ').slice(0, 200);
}

export { TYPE_LABELS };
