import { buildIndex, findTerms, matchTerm } from './normalize';

// Sertifika sözlüğü. Anahtar saklanır, etiket gösterilir (ProductCertificate.name).
// Liste Fırat'ın "hangileri sıkça isteniyor" cevabıyla genişler.
export const CERTIFICATES = [
  { key: 'oeko_tex_100', label: 'OEKO-TEX Standard 100' },
  { key: 'oeko_tex_made_in_green', label: 'OEKO-TEX Made in Green' },
  { key: 'gots', label: 'GOTS (Organik Tekstil)' },
  { key: 'grs', label: 'GRS (Geri Dönüştürülmüş)' },
  { key: 'rcs', label: 'RCS' },
  { key: 'ocs', label: 'OCS (Organik İçerik)' },
  { key: 'bci', label: 'BCI (Better Cotton)' },
  { key: 'bluesign', label: 'bluesign' },
  { key: 'iso_9001', label: 'ISO 9001' },
  { key: 'iso_14001', label: 'ISO 14001' },
  { key: 'reach', label: 'REACH uyumu' },
  { key: 'zdhc', label: 'ZDHC' },
  { key: 'higg', label: 'Higg Index' },
  { key: 'diger', label: 'Diğer' },
] as const;

export type CertificateKey = (typeof CERTIFICATES)[number]['key'];
export const CERTIFICATE_KEYS = new Set<string>(CERTIFICATES.map((c) => c.key));

export const CERTIFICATE_SYNONYMS: Record<CertificateKey, readonly string[]> = {
  oeko_tex_100: ['oeko-tex', 'oeko tex', 'oekotex', 'öko-tex', 'oko tex', 'oeko-tex standard 100', 'oeko tex 100', 'standard 100', 'okotex'],
  oeko_tex_made_in_green: ['made in green', 'oeko-tex made in green'],
  gots: ['global organic textile standard', 'gots sertifikasi'],
  grs: ['global recycled standard', 'grs sertifikasi'],
  rcs: ['recycled claim standard'],
  ocs: ['organic content standard'],
  bci: ['better cotton', 'better cotton initiative'],
  bluesign: ['blue sign', 'bluesign approved'],
  iso_9001: ['iso9001', 'iso 9001:2015', 'iso 9001'],
  iso_14001: ['iso14001', 'iso 14001:2015', 'iso 14001'],
  reach: ['reach uyumlu', 'reach compliant'],
  zdhc: ['zdhc mrsl', 'zero discharge'],
  higg: ['higg', 'higg fem', 'higg index'],
  diger: ['other'],
};

export const CERTIFICATE_INDEX = buildIndex(CERTIFICATE_SYNONYMS);

export function certificateLabel(key: string) {
  return CERTIFICATES.find((c) => c.key === key)?.label ?? key;
}

export function isValidCertificate(key: string) {
  return CERTIFICATE_KEYS.has(key);
}

// Metindeki sertifikalar (etiket fotoğrafı çıkarımı ve arama için).
export function findCertificates(text: string) {
  return findTerms(text, CERTIFICATE_INDEX);
}

export function matchCertificate(text: string) {
  return matchTerm(text, CERTIFICATE_INDEX);
}
