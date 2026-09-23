import { industryByNaf } from '../segments';
import { employeesLabel, makeThrottle, normalizeName, USER_AGENT, type BuyerInput } from '../types';

// Fransa: API Recherche d'entreprises (Sirene + RNE), anahtarsız, ~7 istek/sn sınırı.
// Licence Ouverte (Etalab). `dirigeants` ve kişisel veriler ALINMAZ; bireysel girişimciler
// (unvanı kişi adıdır) ve yayımına itiraz etmiş (statut_diffusion ≠ O) kayıtlar atlanır.
const BASE = 'https://recherche-entreprises.api.gouv.fr/search';
export const SIRENE_MAX_PAGES = 20;
const request = makeThrottle(350);

// INSEE çalışan dilimleri.
const TRANCHE: Record<string, [number, number | null]> = {
  '01': [1, 2], '02': [3, 5], '03': [6, 9], '11': [10, 19], '12': [20, 49], '21': [50, 99], '22': [100, 199],
  '31': [200, 249], '32': [250, 499], '41': [500, 999], '42': [1000, 1999], '51': [2000, 4999], '52': [5000, 9999], '53': [10000, null],
};
export const bigTranches = (min: number) => Object.entries(TRANCHE).filter(([, [lo]]) => lo >= min).map(([k]) => k);

interface SireneResult {
  siren?: string;
  nom_complet?: string;
  nature_juridique?: string;
  statut_diffusion?: string;
  activite_principale?: string;
  tranche_effectif_salarie?: string | null;
  categorie_entreprise?: string | null;
  date_creation?: string | null;
  date_mise_a_jour?: string | null;
  finances?: Record<string, { ca?: number | null; resultat_net?: number | null }> | null;
  complements?: { est_entrepreneur_individuel?: boolean } | null;
  siege?: { code_postal?: string | null; libelle_commune?: string | null; tranche_effectif_salarie?: string | null } | null;
}

export function parseSirene(json: unknown, naf: string): { buyers: BuyerInput[]; totalPages: number } {
  const body = json as { results?: SireneResult[]; total_pages?: number };
  const ind = industryByNaf(naf);
  const buyers: BuyerInput[] = [];
  for (const r of body.results ?? []) {
    if (!r.siren || !r.nom_complet) continue;
    if (r.complements?.est_entrepreneur_individuel || r.nature_juridique === '1000') continue;
    if (r.statut_diffusion && r.statut_diffusion !== 'O') continue;
    const code = r.tranche_effectif_salarie || r.siege?.tranche_effectif_salarie || '';
    const range = TRANCHE[code] ?? null;
    if (ind?.minEmployees && (!range || range[0] < ind.minEmployees)) continue;
    const years = Object.keys(r.finances ?? {}).sort();
    const lastYear = years[years.length - 1];
    const ca = lastYear ? r.finances?.[lastYear]?.ca ?? null : null;
    const cat = r.categorie_entreprise ?? null;
    const activity = r.activite_principale ?? naf;
    buyers.push({
      source: 'sirene',
      sourceId: r.siren,
      name: r.nom_complet,
      normalizedName: normalizeName(r.nom_complet),
      countryIso2: 'FR',
      city: r.siege?.libelle_commune ?? '',
      postalCode: r.siege?.code_postal ?? '',
      website: '',
      industryCode: activity,
      segment: industryByNaf(activity)?.segment ?? ind?.segment ?? 'diger',
      sizeCode: code,
      sizeLabel: range ? employeesLabel(range[0], range[1]) : '',
      employeesMin: range ? range[0] : null,
      revenueEur: typeof ca === 'number' && ca > 0 ? ca : null,
      foundedYear: r.date_creation ? Number(r.date_creation.slice(0, 4)) || null : null,
      sourceUpdatedAt: r.date_mise_a_jour ? new Date(r.date_mise_a_jour) : null,
      raw: { categorie: cat, revenueYear: lastYear ?? null },
    });
  }
  return { buyers, totalPages: body.total_pages ?? 1 };
}

export async function fetchSirene(naf: string, maxPages = SIRENE_MAX_PAGES): Promise<BuyerInput[]> {
  const ind = industryByNaf(naf);
  const extra = ind?.minEmployees ? `&tranche_effectif_salarie=${bigTranches(ind.minEmployees).join(',')}` : '';
  const out: BuyerInput[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `${BASE}?activite_principale=${naf}&etat_administratif=A&per_page=25&page=${page}${extra}`;
    const res = await request(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`sirene_${res.status}`);
    const { buyers, totalPages } = parseSirene(await res.json(), naf);
    out.push(...buyers);
    if (page >= totalPages) break;
  }
  return out;
}
