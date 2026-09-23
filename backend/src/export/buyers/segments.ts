// HS6 → aday alıcı türleri (docs/kesfet-ihracat-plani.md §2.3). Kim bu ürünü satın alır?
// İplik → kumaş üreticileri; kumaş → konfeksiyon, kumaş toptancısı, ev tekstili, markalar;
// hazır giyim → giyim toptancıları, markalar, büyük perakendeciler; ev tekstili → ilgili toptancı/üretici.
// Tüm sicil kodları (Fransa NAF rev.2, BK SIC 2007) ve Türkçe adları tek tabloda.

export type Segment = 'konfeksiyon' | 'kumas_toptan' | 'giyim_toptan' | 'ev_tekstili' | 'kumas_uretici' | 'marka' | 'diger';
export type HsGroup = 'iplik' | 'kumas' | 'giyim' | 'ev';

export const SEGMENT_LABEL: Record<Segment, string> = {
  konfeksiyon: 'Konfeksiyon',
  kumas_toptan: 'Kumaş toptancısı',
  giyim_toptan: 'Giyim toptancısı',
  ev_tekstili: 'Ev tekstili',
  kumas_uretici: 'Kumaş üreticisi',
  marka: 'Marka / perakende',
  diger: 'Diğer',
};

export interface Industry {
  naf?: string; // Fransa (Sirene) NAF kodu
  sic: string[]; // BK Companies House SIC kodları
  segment: Segment;
  label: string; // Türkçe faaliyet adı
  minEmployees?: number; // yalnızca bu büyüklüğün üstü (büyük perakendeciler)
}

export const INDUSTRIES: Industry[] = [
  { naf: '13.20Z', sic: ['13200'], segment: 'kumas_uretici', label: 'Dokuma kumaş üretimi' },
  { naf: '13.91Z', sic: ['13910'], segment: 'kumas_uretici', label: 'Örme kumaş üretimi' },
  { naf: '14.12Z', sic: ['14120'], segment: 'konfeksiyon', label: 'İş giysisi üretimi' },
  { naf: '14.13Z', sic: ['14131', '14132'], segment: 'konfeksiyon', label: 'Dış giyim üretimi' },
  { naf: '14.14Z', sic: ['14141', '14142'], segment: 'konfeksiyon', label: 'İç giyim üretimi' },
  { naf: '14.19Z', sic: ['14190'], segment: 'konfeksiyon', label: 'Diğer giyim ve aksesuar üretimi' },
  { naf: '14.39Z', sic: ['14390'], segment: 'konfeksiyon', label: 'Örme giyim üretimi' },
  { naf: '13.92Z', sic: ['13921', '13923'], segment: 'ev_tekstili', label: 'Ev tekstili üretimi' },
  { naf: '46.41Z', sic: ['46410'], segment: 'kumas_toptan', label: 'Tekstil toptancılığı' },
  { naf: '46.42Z', sic: ['46420'], segment: 'giyim_toptan', label: 'Giyim toptancılığı' },
  { naf: '46.47Z', sic: ['46470'], segment: 'ev_tekstili', label: 'Mobilya, halı ve ev eşyası toptancılığı' },
  { naf: '47.71Z', sic: ['47710'], segment: 'marka', label: 'Giyim perakendesi', minEmployees: 50 },
];

export const industryByNaf = (naf: string) => INDUSTRIES.find((i) => i.naf === naf);
export const industryBySic = (sic: string) => INDUSTRIES.find((i) => i.sic.includes(sic));

// Her ürün grubu için: hangi faaliyet kodları alıcıdır ve uyum ağırlığı (0-1, puanın %40'ı).
interface GroupRule {
  label: string;
  naf: Record<string, number>;
  brands: number; // Wikidata markalarının uyumu
}
export const GROUP_RULES: Record<HsGroup, GroupRule> = {
  iplik: { label: 'iplik', naf: { '13.91Z': 1, '13.20Z': 1 }, brands: 0.15 },
  kumas: { label: 'kumaş', naf: { '14.13Z': 1, '14.14Z': 1, '14.19Z': 0.9, '14.39Z': 0.9, '14.12Z': 0.8, '46.41Z': 0.9, '13.92Z': 0.6 }, brands: 0.8 },
  giyim: { label: 'hazır giyim', naf: { '46.42Z': 1, '47.71Z': 0.9 }, brands: 1 },
  ev: { label: 'ev tekstili', naf: { '13.92Z': 1, '46.47Z': 0.9, '46.41Z': 0.8 }, brands: 0.5 },
};

const inRange = (hs4: number, a: number, b: number) => hs4 >= a && hs4 <= b;

// HS6 → ürün grubu. Fasıl 50-55: iplik başlıkları ayrılır, gerisi kumaş; 56-60 kumaş;
// 61-62 hazır giyim; 63 ev tekstili (6301-6304), diğer 63 hazır eşya → giyim.
export function hsGroup(hs6: string): HsGroup {
  const hs4 = Number(hs6.slice(0, 4));
  const ch = Math.floor(hs4 / 100);
  const yarn =
    inRange(hs4, 5004, 5006) || inRange(hs4, 5106, 5110) || inRange(hs4, 5204, 5207) || inRange(hs4, 5306, 5308) ||
    inRange(hs4, 5401, 5406) || inRange(hs4, 5501, 5511);
  if (yarn) return 'iplik';
  if (ch === 61 || ch === 62) return 'giyim';
  if (ch === 63) return inRange(hs4, 6301, 6304) ? 'ev' : 'giyim';
  return 'kumas';
}

export function segmentWeight(group: HsGroup, source: string, industryCode: string): number {
  const rule = GROUP_RULES[group];
  if (source === 'wikidata') return rule.brands;
  const ind = source === 'companies_house' ? industryBySic(industryCode) : industryByNaf(industryCode);
  return ind?.naf ? rule.naf[ind.naf] ?? 0 : 0;
}

// Grubun eşitlenecek sicil kodları.
export const nafCodesFor = (group: HsGroup) => Object.keys(GROUP_RULES[group].naf);
export const sicCodesFor = (group: HsGroup) =>
  nafCodesFor(group)
    .flatMap((n) => industryByNaf(n)?.sic ?? [])
    // Companies House büyüklük vermediği için küçük perakendeci ayıklanamaz: perakende dışarıda.
    .filter((s) => s !== '47710');
