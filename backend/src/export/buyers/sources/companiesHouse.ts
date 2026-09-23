import { industryBySic } from '../segments';
import { makeThrottle, normalizeName, type BuyerInput } from '../types';

// BK Companies House gelişmiş arama (OGL). Anahtar gerekir: COMPANIES_HOUSE_KEY tanımlı değilse
// kaynak kapalıdır. Sınır 600 istek/5 dk; SIC listesi başına tek sorgu (en çok 5000 kayıt).
const BASE = 'https://api.company-information.service.gov.uk/advanced-search/companies';
const request = makeThrottle(600);

export const companiesHouseKeySet = () => Boolean(process.env.COMPANIES_HOUSE_KEY?.trim());

interface ChItem {
  company_name?: string;
  company_number?: string;
  company_status?: string;
  date_of_creation?: string;
  sic_codes?: string[];
  registered_office_address?: { locality?: string; postal_code?: string };
}

export function parseCompaniesHouse(json: unknown, wanted: string[]): BuyerInput[] {
  const items = (json as { items?: ChItem[] }).items ?? [];
  const out: BuyerInput[] = [];
  for (const it of items) {
    if (!it.company_number || !it.company_name) continue;
    if (it.company_status && it.company_status !== 'active') continue;
    const sic = (it.sic_codes ?? []).find((s) => wanted.includes(s)) ?? it.sic_codes?.[0] ?? '';
    out.push({
      source: 'companies_house',
      sourceId: it.company_number,
      name: it.company_name,
      normalizedName: normalizeName(it.company_name),
      countryIso2: 'GB',
      city: it.registered_office_address?.locality ?? '',
      postalCode: it.registered_office_address?.postal_code ?? '',
      website: '',
      industryCode: sic,
      segment: industryBySic(sic)?.segment ?? 'diger',
      sizeCode: '',
      sizeLabel: '',
      employeesMin: null,
      revenueEur: null,
      foundedYear: it.date_of_creation ? Number(it.date_of_creation.slice(0, 4)) || null : null,
      sourceUpdatedAt: null,
      raw: { sic: it.sic_codes ?? [] },
    });
  }
  return out;
}

export async function fetchCompaniesHouse(sics: string[]): Promise<BuyerInput[]> {
  const key = process.env.COMPANIES_HOUSE_KEY?.trim();
  if (!key) throw new Error('companies_house_key_missing');
  const url = `${BASE}?sic_codes=${sics.join(',')}&company_status=active&size=5000`;
  const auth = Buffer.from(`${key}:`).toString('base64');
  const res = await request(url, { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } });
  if (res.status === 404) return []; // eşleşme yok
  if (!res.ok) throw new Error(`companies_house_${res.status}`);
  return parseCompaniesHouse(await res.json(), sics);
}
