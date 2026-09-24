// Sektör gündemi: anahtar kelimeyle konu etiketleme (TR + EN) ve tekstil ilgisi süzgeci.
export const TOPICS = [
  { key: 'hammadde', label: 'Hammadde' },
  { key: 'fiyat', label: 'Fiyat' },
  { key: 'ihracat', label: 'İhracat' },
  { key: 'fuar', label: 'Fuar' },
  { key: 'moda', label: 'Moda' },
  { key: 'makine', label: 'Makine' },
  { key: 'surdurulebilirlik', label: 'Sürdürülebilirlik' },
  { key: 'is_dunyasi', label: 'İş dünyası' },
] as const;
export type TopicKey = (typeof TOPICS)[number]['key'];
export const TOPIC_KEYS = TOPICS.map((t) => t.key) as [TopicKey, ...TopicKey[]];
export const topicLabel = (k: string) => TOPICS.find((t) => t.key === k)?.label ?? k;

// Kelime başı eşleşmesi (sonu açık, Türkçe ekler için): "ihracatı", "fiyatlar" yakalanır.
const KEYWORDS: Record<Exclude<TopicKey, 'is_dunyasi'>, string[]> = {
  hammadde: ['iplik', 'pamuk', 'polyester', 'elyaf', 'viskon', 'yarn', 'fibre', 'fiber', 'cotton', 'hammadde', 'yün', 'wool', 'naylon', 'nylon'],
  fiyat: ['fiyat', 'price', 'pricing', 'maliyet', 'cost', 'zam'],
  ihracat: ['ihracat', 'ihraç', 'export', 'gümrük', 'tariff', 'trade', 'ithalat', 'import', 'dış ticaret'],
  fuar: ['fuar', 'fair', 'exhibition', 'expo', 'itma', 'texworld', 'heimtextil'],
  moda: ['moda', 'fashion', 'marka', 'brand', 'perakende', 'retail', 'koleksiyon', 'collection', 'hazır giyim', 'apparel'],
  makine: ['makine', 'machine', 'knitting', 'dokuma makinesi', 'teknoloji', 'technology', 'dijital', 'digital', 'otomasyon', 'automation'],
  surdurulebilirlik: ['sürdürülebilir', 'geri dönüşüm', 'geri dönüştür', 'sustainab', 'recycl', 'circular', 'döngüsel', 'karbon', 'carbon', 'emisyon', 'emission'],
};

const lower = (s: string) => s.toLocaleLowerCase('tr-TR');

function hasWord(text: string, kw: string): boolean {
  const k = lower(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${k}`, 'u').test(text);
}

export function tagTopics(title: string, summary: string): TopicKey[] {
  const text = lower(`${title} ${summary}`);
  const out: TopicKey[] = [];
  for (const [topic, kws] of Object.entries(KEYWORDS) as [TopicKey, string[]][]) {
    if (kws.some((k) => hasWord(text, k))) out.push(topic);
  }
  return out.length ? out : ['is_dunyasi'];
}

// Genel iş haberi kaynağı için: yalnızca tekstille ilgili başlıklar kalır.
const TEXTILE_WORDS = ['tekstil', 'hazır giyim', 'hazırgiyim', 'konfeksiyon', 'kumaş', 'iplik', 'pamuk', 'elyaf', 'dokuma', 'örme', 'triko', 'denim', 'boyahane', 'terbiye', 'giyim', 'moda', 'deri', 'ayakkabı', 'halı', 'ev tekstili', 'textile', 'apparel', 'garment', 'fabric', 'yarn', 'cotton'];

export function isTextileRelated(title: string, summary: string): boolean {
  const text = lower(`${title} ${summary}`);
  return TEXTILE_WORDS.some((w) => hasWord(text, w));
}
