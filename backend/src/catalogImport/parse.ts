// Firma web sitesindeki bir ürün sayfasından etiket tabanlı alan okuma.
// Bağımlılık yok (düzenli ifade + basit metin çıkarma); yalnızca ANA ürün
// bloğu okunur: "Related products / Benzer ürünler" bölümünden sonrası diğer
// ürünlerin özelliklerini taşıdığı için kesilir.

export interface ParsedImage {
  // Tam boy (WooCommerce data-large_image ya da boyut eki atılmış adres)
  url: string;
  // Sitenin kendi küçültülmüş kopyası (ör. -600x400); tam boy sınırı aşarsa kullanılır.
  smallUrl: string | null;
}

export interface ParsedProductPage {
  name: string;
  code: string;
  typeText: string;
  weightGsm: number | null;
  widthCm: number | null;
  compositionText: string;
  uses: string[];
  images: ParsedImage[];
  // LLM yedeği için sayfanın ana metni (etiketler eksikse)
  mainText: string;
}

const LABELS: Record<'code' | 'type' | 'weight' | 'width' | 'comp' | 'uses', RegExp> = {
  code: /^(product\s*code|item\s*code|article(?:\s*(?:no|code))?|art\.?\s*no|ref(?:erence)?(?:\s*no)?|ürün\s*kodu|urun\s*kodu|kod|artikel)$/i,
  type: /^(product\s*type|fabric\s*type|type|ürün\s*tipi|urun\s*tipi|ürün\s*türü|kumaş\s*tipi|kumaş\s*türü|kumas\s*tipi|tip|tür)$/i,
  weight: /^(weight|gsm|fabric\s*weight|gramaj|ağırlık|agirlik)$/i,
  width: /^(width|fabric\s*width|en|eni|genişlik|genislik|kumaş\s*eni)$/i,
  comp: /^(comp|comp\.|composition|content|fiber\s*content|içerik|icerik|kompozisyon|hammadde)$/i,
  uses: /^(uses|usage|use|end\s*uses?|application|applications|kullanım|kullanim|kullanım\s*alanı|kullanım\s*alanları|kullanim\s*alani)$/i,
};

const RELATED_MARKERS = [
  /<section[^>]*class="[^"]*\brelated\b/i,
  /<section[^>]*class="[^"]*\bupsells\b/i,
  />\s*(related products|benzer ürünler|ilgili ürünler|you may also like)\s*</i,
];

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
};

export function decodeEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// HTML → satırlar: blok etiketleri satır sonuna çevrilir, betik/stil atılır.
export function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|dt|dd|ul|ol|table|section|article|figure|header|footer)>/gi, '\n')
    .replace(/<(li|dt|dd|tr|p|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<\/th>/gi, ': ')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .split('\n')
    .map((l) => l.replace(/[\s ]+/g, ' ').replace(/(:\s*)+$/, ':').trim())
    .filter(Boolean);
}

// Ana ürün bloğu: <main> (yoksa body) başından "Related products"a kadar.
export function mainBlock(html: string): string {
  let start = html.search(/<main\b/i);
  if (start < 0) start = html.search(/<body\b/i);
  if (start < 0) start = 0;
  let block = html.slice(start);
  let cut = block.length;
  for (const re of RELATED_MARKERS) {
    const i = block.search(re);
    if (i >= 0 && i < cut) cut = i;
  }
  block = block.slice(0, cut);
  // Site üst bandı <main> içindeyse bile menüleri at.
  return block.replace(/<(nav|header|footer)\b[\s\S]*?<\/\1>/gi, ' ');
}

const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? decodeEntities(m[2] ?? m[3] ?? '') : null;
};

const SIZE_SUFFIX = /-(\d{2,4})x(\d{2,4})(?=\.(jpe?g|png|webp|gif)(\?|$))/i;
const SKIP_IMAGE = /(logo|favicon|slider|banner|icon|sprite|placeholder|avatar|flag|gtranslate|loader|spinner|cropped-)/i;
const IMAGE_EXT = /\.(jpe?g|png|webp)(\?|$)/i;

export function stripSizeSuffix(url: string) {
  return url.replace(SIZE_SUFFIX, '');
}

function absolutize(url: string, base: string) {
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

export function extractImages(block: string, pageUrl: string, max = 4): ParsedImage[] {
  const out: ParsedImage[] = [];
  const seen = new Set<string>();
  const push = (full: string | null, small: string | null) => {
    if (!full) return;
    const url = absolutize(full, pageUrl);
    if (!url || !IMAGE_EXT.test(url) || SKIP_IMAGE.test(url)) return;
    const key = stripSizeSuffix(url);
    if (seen.has(key)) return;
    seen.add(key);
    const smallAbs = small ? absolutize(small, pageUrl) : null;
    out.push({ url, smallUrl: smallAbs && smallAbs !== url ? smallAbs : null });
  };

  // 1) WooCommerce galerisi
  const galleryRe = /<div[^>]*woocommerce-product-gallery__image[^>]*>([\s\S]*?)<\/div>/gi;
  for (const m of block.matchAll(galleryRe)) {
    const img = m[1].match(/<img\b[^>]*>/i)?.[0] ?? '';
    const href = m[1].match(/<a\b[^>]*href\s*=\s*"([^"]+)"/i)?.[1] ?? null;
    const full = attr(img, 'data-large_image') ?? href ?? attr(img, 'data-src') ?? attr(img, 'src');
    const small = attr(img, 'src');
    push(full, small && SIZE_SUFFIX.test(small) ? small : null);
  }
  // 2) Genel yedek: ana bloktaki görseller (boyut ekli kopya → asıl dosya)
  if (out.length === 0) {
    for (const m of block.matchAll(/<img\b[^>]*>/gi)) {
      const tag = m[0];
      const src = attr(tag, 'data-large_image') ?? attr(tag, 'data-src') ?? attr(tag, 'src');
      if (!src || src.startsWith('data:')) continue;
      const w = Number(attr(tag, 'width') ?? 0);
      if (w && w < 150) continue;
      const full = SIZE_SUFFIX.test(src) ? stripSizeSuffix(src) : src;
      push(full, SIZE_SUFFIX.test(src) ? src : null);
    }
  }
  return out.slice(0, max);
}

const num = (value: string) => {
  const m = value.match(/(\d+(?:[.,]\d+)?)/);
  return m ? Number(m[1].replace(',', '.')) : null;
};

export function parseWeight(value: string): number | null {
  const n = num(value);
  if (n === null || n <= 0) return null;
  if (/oz/i.test(value)) return Math.round(n * 33.906);
  return n;
}

export function parseWidth(value: string): number | null {
  const n = num(value);
  if (n === null || n <= 0) return null;
  if (/\bmm\b/i.test(value)) return n / 10;
  if (/(inch|\binc?h?\b|")/i.test(value)) return Math.round(n * 2.54);
  if (/\bm\b/i.test(value) && n < 5) return n * 100;
  return n;
}

export function splitUses(value: string): string[] {
  return value
    .split(/[|,;/•·]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 40);
}

function readName(html: string, block: string) {
  const h1 = block.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const clean = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  if (h1 && clean(h1)) return clean(h1);
  const og = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"/i)?.[1];
  const title = og ?? html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '';
  return clean(title).split(/\s[-|–]\s/)[0].trim();
}

export function parseProductPage(html: string, pageUrl: string): ParsedProductPage {
  const block = mainBlock(html);
  const lines = htmlToLines(block);
  const found: Partial<Record<keyof typeof LABELS, string>> = {};
  let uses: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([^:：]{1,40}?)\s*[:：]\s*(.*)$/);
    if (!m) continue;
    const label = m[1].trim().replace(/\*+/g, '');
    const value = m[2].trim();
    const key = (Object.keys(LABELS) as (keyof typeof LABELS)[]).find((k) => LABELS[k].test(label));
    if (!key || found[key] !== undefined) continue;
    if (key === 'uses') {
      const collected = value ? splitUses(value) : [];
      // Değer alt satırlarda liste olarak gelebilir (<ul><li>APPAREL</li>…).
      for (let j = i + 1; j < lines.length && j <= i + 15; j++) {
        if (/[:：]/.test(lines[j])) break;
        collected.push(...splitUses(lines[j]));
      }
      uses = collected;
      found.uses = collected.join(', ');
    } else if (value) {
      found[key] = value;
    }
  }

  return {
    name: readName(html, block),
    code: (found.code ?? '').slice(0, 60),
    typeText: found.type ?? '',
    weightGsm: found.weight ? parseWeight(found.weight) : null,
    widthCm: found.width ? parseWidth(found.width) : null,
    compositionText: (found.comp ?? '').slice(0, 200),
    uses: [...new Set(uses.map((u) => u.toUpperCase()))],
    images: extractImages(block, pageUrl),
    mainText: lines.join('\n').slice(0, 6000),
  };
}
