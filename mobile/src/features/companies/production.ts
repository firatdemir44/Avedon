import { fetchProductionReferenceImage, type CompanyProduction, type ProductionOption } from '../../api/client';
import { createImageCache } from '../imageCache';
import { tr, locale } from '../../i18n';

// Üretim kabiliyeti (docs/konfeksiyon-plani.md Bölüm A): Üretim sekmesi olan firma türleri.
export const PRODUCTION_COMPANY_TYPES = ['konfeksiyon', 'fason_atolye'];
export const hasProductionTab = (companyType: string | null | undefined) =>
  PRODUCTION_COMPANY_TYPES.includes(companyType ?? '');

// Referans görselleri liste yanıtında gelmez; tek tek çekilip bellekte tutulur.
const cache = createImageCache((key) => {
  const [companyId, position] = key.split(':');
  return fetchProductionReferenceImage(companyId, Number(position));
});
const refKey = (companyId: string, position: number) => `${companyId}:${position}`;
export const getCachedReferenceImage = (companyId: string, position: number) => cache.get(refKey(companyId, position));
export const loadReferenceImage = (companyId: string, position: number) => cache.load(refKey(companyId, position));
export const setCachedReferenceImage = (companyId: string, position: number, url: string) => cache.set(refKey(companyId, position), url);
// Silinen sıra yeni görselle yeniden dolabilir; eski kopya gösterilmesin.
export const dropCachedReferenceImage = (companyId: string, position: number) => cache.delete(refKey(companyId, position));

export const EMPTY_PRODUCTION: CompanyProduction = {
  productGroups: [],
  mainGroups: [],
  groupsOther: '',
  workMode: '',
  monthlyCapacity: null,
  capacityByGroup: {},
  moqPerModel: null,
  moqPerColor: null,
  sampleLeadDays: null,
  productionLeadDays: null,
  services: [],
  operations: [],
  fabricMode: '',
  certificates: [],
  exportCountries: [],
  employeeRange: '',
};

export const optionLabel = (list: ProductionOption[], key: string) => list.find((o) => o.key === key)?.label ?? key;

const num = (n: number) => n.toLocaleString(locale());

// Sektörün dili (DESIGN.md): "Kapasite 50.000/ay · MOQ 500 · Termin 30 gün".
export function productionSummaryLine(p: CompanyProduction) {
  return [
    p.monthlyCapacity != null ? tr('Kapasite {n}/ay', { n: num(p.monthlyCapacity) }) : '',
    p.moqPerModel != null ? tr('MOQ {n}', { n: num(p.moqPerModel) }) : '',
    p.moqPerColor != null ? tr('Renk başı {n}', { n: num(p.moqPerColor) }) : '',
    p.sampleLeadDays != null ? tr('Numune {n} gün', { n: p.sampleLeadDays }) : '',
    p.productionLeadDays != null ? tr('Termin {n} gün', { n: p.productionLeadDays }) : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

// Hiç bilgi girilmemiş mi (sekmede boş durum için).
export function isProductionEmpty(p: CompanyProduction, referenceCount: number) {
  return (
    referenceCount === 0 &&
    p.productGroups.length === 0 &&
    !p.groupsOther.trim() &&
    !p.workMode &&
    p.monthlyCapacity == null &&
    p.moqPerModel == null &&
    p.moqPerColor == null &&
    p.sampleLeadDays == null &&
    p.productionLeadDays == null &&
    p.services.length === 0 &&
    p.operations.length === 0 &&
    !p.fabricMode &&
    p.certificates.length === 0 &&
    p.exportCountries.length === 0 &&
    !p.employeeRange
  );
}
