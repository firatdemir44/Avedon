import type { Segment } from './segments';

export type BuyerSource = 'sirene' | 'wikidata' | 'companies_house';

// Kaynaktan ayrıştırılmış tek alıcı (veritabanına yazılacak alanlar). Kişi adı içermez.
export interface BuyerInput {
  source: BuyerSource;
  sourceId: string;
  name: string;
  normalizedName: string;
  countryIso2: string;
  city: string;
  postalCode: string;
  website: string;
  industryCode: string;
  segment: Segment;
  sizeCode: string;
  sizeLabel: string;
  employeesMin: number | null; // raw içinde saklanır
  revenueEur: number | null;
  foundedYear: number | null;
  sourceUpdatedAt: Date | null;
  raw: Record<string, unknown>;
}

export const SOURCE_LABEL: Record<BuyerSource, string> = {
  sirene: "Kaynak: Fransa Sirene / Recherche d'entreprises (Licence Ouverte)",
  wikidata: 'Kaynak: Wikidata (CC0)',
  companies_house: 'Kaynak: UK Companies House (OGL)',
};

export function sourceUrl(source: string, sourceId: string): string {
  if (source === 'sirene') return `https://annuaire-entreprises.data.gouv.fr/entreprise/${sourceId}`;
  if (source === 'wikidata') return `https://www.wikidata.org/wiki/${sourceId}`;
  return `https://find-and-update.company-information.service.gov.uk/company/${sourceId}`;
}

const LEGAL = /\b(sas|sasu|sarl|sa|eurl|snc|sci|ltd|limited|plc|llp|gmbh|ag|kg|co|inc|srl|spa|bv|nv)\b/g;
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(LEGAL, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const fmt = (n: number) => n.toLocaleString('tr-TR');
export function employeesLabel(min: number | null, max: number | null): string {
  if (min == null) return '';
  if (max == null) return `${fmt(min)}+ çalışan`;
  return `${fmt(min)}–${fmt(max)} çalışan`;
}

export const USER_AGENT = 'Takyon/1.0 (+https://takyon.ai; firatdemir@gmail.com)';

// Kaynak başına tek sıra: istekler arasında en az gapMs; 429/5xx'te artan beklemeyle yeniden dener.
export function makeThrottle(gapMs: number, timeoutMs = 30_000) {
  let chain: Promise<unknown> = Promise.resolve();
  let lastAt = 0;
  const throttled = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(async () => {
      const wait = lastAt + gapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        return await fn();
      } finally {
        lastAt = Date.now();
      }
    });
    chain = run.catch(() => undefined);
    return run;
  };
  return async (url: string, init: RequestInit = {}): Promise<Response> => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await throttled(() => fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) }));
      // 429/502/503 geçicidir; 504 (sorgu zaman aşımı) tekrar denenmez, kotayı boşa harcar.
      if (![429, 502, 503].includes(res.status)) return res;
      const after = Number(res.headers.get('retry-after'));
      await new Promise((r) => setTimeout(r, after > 0 ? Math.min(after, 120) * 1000 : 1500 * 2 ** attempt));
    }
    throw new Error('rate_limited');
  };
}
