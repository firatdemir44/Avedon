import { GROUP_RULES, industryByNaf, industryBySic, segmentWeight, type HsGroup } from './segments';
import { wikidataIndustryLabel } from './sources/wikidata';
import { t, tx, normalizeLang, type Lang } from '../../i18n';

// Aday alıcı puanı (0-100), saf fonksiyon: ürün grubuna uyum 40 + büyüklük 30 +
// ulaşılabilirlik 15 + güncellik/etkinlik 10 + marka işareti 5. Gerekçeler Türkçe ve sade.
export interface ScoreInput {
  source: string;
  industryCode: string;
  sizeLabel: string;
  employeesMin: number | null;
  categorie: string | null; // Sirene: PME / ETI / GE
  revenueEur: number | null;
  website: string;
  city: string;
  sourceUpdatedAt: Date | null;
}

export interface BuyerScore {
  score: number;
  reasons: string[];
  parts: { label: string; points: number }[];
}

const TWO_YEARS = 2 * 365 * 86400_000;

export function employeePoints(n: number | null): number {
  if (n == null) return 0;
  if (n >= 250) return 30;
  if (n >= 100) return 26;
  if (n >= 50) return 22;
  if (n >= 20) return 18;
  if (n >= 10) return 14;
  if (n >= 1) return 8;
  return 0;
}
const CATEGORY_POINTS: Record<string, number> = { GE: 30, ETI: 24, PME: 12 };
const CATEGORY_LABEL: Record<string, string> = { GE: 'Büyük işletme', ETI: 'Orta büyüklükte işletme', PME: 'KOBİ' };

export function formatRevenue(eur: number, lang: Lang | string = 'tr'): string {
  if (normalizeLang(lang) === 'en') {
    if (eur >= 1e9) return `~€${(eur / 1e9).toLocaleString('en-GB', { maximumFractionDigits: 1 })} billion`;
    if (eur >= 1e6) return `~€${Math.round(eur / 1e6).toLocaleString('en-GB')} million`;
    return `~€${Math.round(eur / 1e3).toLocaleString('en-GB')}K`;
  }
  if (eur >= 1e9) return `~${(eur / 1e9).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} milyar €`;
  if (eur >= 1e6) return `~${Math.round(eur / 1e6).toLocaleString('tr-TR')} milyon €`;
  return `~${Math.round(eur / 1e3).toLocaleString('tr-TR')} bin €`;
}

export function industryReason(source: string, code: string, lang: Lang | string = 'tr'): string {
  if (source === 'wikidata') return t(lang, "Wikidata'da {industry} kuruluşu olarak kayıtlı", { industry: t(lang, wikidataIndustryLabel(code)) });
  if (source === 'companies_house') {
    const ind = industryBySic(code);
    return t(lang, "BK şirketler sicilinde '{industry} (SIC {code})' olarak kayıtlı", { industry: t(lang, ind?.label ?? 'tekstil'), code });
  }
  const ind = industryByNaf(code);
  return t(lang, "Fransa ticaret sicilinde '{industry} ({code})' olarak kayıtlı", { industry: t(lang, ind?.label ?? 'tekstil'), code });
}

/** Sicilden gelen hazır boyut etiketi ('1.000–1.999 çalışan', '~5.000 çalışan'). */
export function localizeSize(label: string, lang: Lang | string = 'tr'): string {
  if (!label || normalizeLang(lang) !== 'en') return label;
  return tx(lang, label).replace(/(\d)\.(\d{3})/g, '$1,$2');
}

export function scoreBuyer(b: ScoreInput, group: HsGroup, now = Date.now(), lang: Lang | string = 'tr'): BuyerScore {
  const reasons: string[] = [];
  const weight = segmentWeight(group, b.source, b.industryCode);
  const fit = Math.round(40 * weight);
  reasons.push(industryReason(b.source, b.industryCode, lang));
  if (weight >= 0.9) {
    const gl = t(lang, GROUP_RULES[group].label);
    reasons.push(t(lang, '{group} için doğrudan alıcı türü', { group: `${gl[0].toUpperCase()}${gl.slice(1)}` }));
  }

  // Büyüklük: çalışan sayısı ile işletme kategorisinin yükseği; bilinmiyorsa Wikidata'da kayıtlı
  // olmak (bilinen marka) orta puan, sicilde bilgi yoksa düşük puan.
  const empPts = employeePoints(b.employeesMin);
  const catPts = b.categorie ? CATEGORY_POINTS[b.categorie] ?? 0 : 0;
  let size = Math.max(empPts, catPts);
  if (size === 0) size = b.source === 'wikidata' ? 12 : 6;
  if (b.sizeLabel) reasons.push(localizeSize(b.sizeLabel, lang));
  else if (b.categorie && CATEGORY_LABEL[b.categorie]) reasons.push(t(lang, CATEGORY_LABEL[b.categorie]));
  if (b.revenueEur) reasons.push(t(lang, 'Yıllık ciro {revenue}', { revenue: formatRevenue(b.revenueEur, lang) }));

  const contact = b.website ? 15 : b.city ? 5 : 0;
  if (b.website) reasons.push(t(lang, 'Web sitesi var'));

  let fresh = 0;
  if (b.sourceUpdatedAt && now - b.sourceUpdatedAt.getTime() < TWO_YEARS) fresh += 5;
  if (b.revenueEur) fresh += 5;

  const brand = b.source === 'wikidata' || industryByNaf(b.industryCode)?.segment === 'marka' || industryBySic(b.industryCode)?.segment === 'marka' ? 5 : 0;

  const parts = [
    { label: t(lang, 'Ürüne uyum'), points: fit },
    { label: t(lang, 'Büyüklük'), points: size },
    { label: t(lang, 'Ulaşılabilirlik'), points: contact },
    { label: t(lang, 'Güncellik'), points: fresh },
    { label: t(lang, 'Marka'), points: brand },
  ];
  const score = Math.max(0, Math.min(100, fit + size + contact + fresh + brand));
  return { score, reasons, parts };
}
