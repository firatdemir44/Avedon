import { employeesLabel, makeThrottle, normalizeName, USER_AGENT, type BuyerInput } from '../types';

// Wikidata SPARQL (CC0). Ülke başına tek küçük sorgu: sektörü giyim sanayi (Q11828862),
// tekstil sanayi (Q607081) ya da moda (Q12684) olan veya "moda markası" (Q1618899, doğrulandı)
// örneği olan, kapanmamış (P576 yok) kuruluşlar. Kişi verisi alınmaz.
const ENDPOINT = 'https://query.wikidata.org/sparql';
// WDQS sunucu tarafında 60 sn sınırı var; yoğun saatlerde basit sorgu bile 20 sn sürebiliyor.
const request = makeThrottle(1500, 75_000);

// Hedef ülkelerin Wikidata öğeleri (P297 ile doğrulandı, 2026-09-23). `?country wdt:P297` ile
// aramak sorgu planını bozup 60 sn zaman aşımına düşürüyor; öğe doğrudan verilince <1 sn.
const COUNTRY_QID: Record<string, string> = {
  DE: 'Q183', IT: 'Q38', ES: 'Q29', NL: 'Q55', BE: 'Q31', FR: 'Q142', PL: 'Q36', PT: 'Q45', RO: 'Q218', GB: 'Q145',
  US: 'Q30', CA: 'Q16', MX: 'Q96', CO: 'Q739', PE: 'Q419', CL: 'Q298', BR: 'Q155', AE: 'Q878', SA: 'Q851', QA: 'Q846',
  KW: 'Q817', IQ: 'Q796', JO: 'Q810', EG: 'Q79', MA: 'Q1028', TN: 'Q948', DZ: 'Q262', ZA: 'Q258', KE: 'Q114', ET: 'Q115',
  NG: 'Q1033', PK: 'Q843', BD: 'Q902', UZ: 'Q265', KZ: 'Q232', GE: 'Q230', IL: 'Q801', IR: 'Q794',
};

export function wikidataQuery(iso2: string): string {
  if (!/^[A-Z]{2}$/.test(iso2)) throw new Error('bad_iso2');
  const qid = COUNTRY_QID[iso2];
  // Ülke sabiti her UNION dalının içinde olmalı; dışarıda (VALUES/BIND) plan bozulup 504 veriyor.
  const pre = qid ? '' : `?country wdt:P297 "${iso2}" .`;
  const country = qid ? `wd:${qid}` : '?country';
  // Önce aday kümesi (alt sorgu), sonra yalnız onlar için isteğe bağlı alanlar: tüm etiketler
  // üzerinde süzgeçten çok daha hafif.
  return `SELECT ?c (SAMPLE(COALESCE(?en, ?mul)) AS ?name) (SAMPLE(?site) AS ?website) (MAX(?emp) AS ?employees) (MIN(?inc) AS ?inception) (SAMPLE(?ind) AS ?industry) WHERE {
  { SELECT DISTINCT ?c ?ind WHERE {
    ${pre}
    { VALUES ?ind { wd:Q11828862 wd:Q607081 wd:Q12684 } ?c wdt:P452 ?ind . ?c wdt:P17 ${country} . }
    UNION { ?c wdt:P31 wd:Q1618899 . ?c wdt:P17 ${country} . BIND(wd:Q1618899 AS ?ind) }
    FILTER NOT EXISTS { ?c wdt:P576 ?end }
  } LIMIT 600 }
  OPTIONAL { ?c wdt:P856 ?site }
  OPTIONAL { ?c wdt:P1128 ?emp }
  OPTIONAL { ?c wdt:P571 ?inc }
  OPTIONAL { ?c rdfs:label ?en . FILTER(LANG(?en) = "en") }
  OPTIONAL { ?c rdfs:label ?mul . FILTER(LANG(?mul) = "mul") }
} GROUP BY ?c`;
}

const INDUSTRY_LABEL: Record<string, string> = {
  Q11828862: 'giyim sanayi',
  Q607081: 'tekstil sanayi',
  Q12684: 'moda',
  Q1618899: 'moda markası',
};
export const wikidataIndustryLabel = (q: string) => INDUSTRY_LABEL[q] ?? 'moda/tekstil';

type Cell = { value: string } | undefined;
const qid = (uri?: string) => (uri ? uri.slice(uri.lastIndexOf('/') + 1) : '');

export function parseWikidata(json: unknown, iso2: string): BuyerInput[] {
  const rows = (json as { results?: { bindings?: Record<string, Cell>[] } }).results?.bindings ?? [];
  const out: BuyerInput[] = [];
  for (const b of rows) {
    const id = qid(b.c?.value);
    const name = b.name?.value?.trim();
    if (!id || !name || /^Q\d+$/.test(name)) continue;
    const empRaw = b.employees?.value ? Math.round(Number(b.employees.value)) : 0;
    const emp = empRaw > 0 ? empRaw : null;
    const inc = b.inception?.value ? Number(b.inception.value.slice(0, 4)) : null;
    const site = b.website?.value ?? '';
    out.push({
      source: 'wikidata',
      sourceId: id,
      name,
      normalizedName: normalizeName(name),
      countryIso2: iso2,
      city: '',
      postalCode: '',
      website: /^https?:\/\//.test(site) ? site : '',
      industryCode: qid(b.industry?.value),
      segment: 'marka',
      sizeCode: emp ? String(emp) : '',
      sizeLabel: emp ? `~${employeesLabel(emp, null).replace('+', '')}` : '',
      employeesMin: emp,
      revenueEur: null,
      foundedYear: inc && inc > 1000 ? inc : null,
      sourceUpdatedAt: null,
      raw: { industry: qid(b.industry?.value) },
    });
  }
  return out;
}

export async function fetchWikidata(iso2: string): Promise<BuyerInput[]> {
  const url = `${ENDPOINT}?query=${encodeURIComponent(wikidataQuery(iso2))}`;
  const res = await request(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' } });
  if (!res.ok) throw new Error(`wikidata_${res.status}`);
  return parseWikidata(await res.json(), iso2);
}
