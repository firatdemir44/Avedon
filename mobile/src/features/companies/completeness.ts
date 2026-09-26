import { tr } from '../../i18n';
import type { CompanyProduction } from '../../api/client';
import { hasProductionTab } from './production';
// "Firma sayfanı tamamla" (Aşama B: adım adım şirket sayfası oluşturma).
// Firma verisinden adım adım durum ve yüzde çıkaran saf fonksiyon: hem
// CompanySetupScreen (hangi adımdan başlanacak, ilerleme çubuğu) hem de
// CompanyProfileScreen (üstteki "%40 tamamlandı" şeridi) aynı hesabı kullanır.

export type CompanySetupStepKey = 'tanitim' | 'iletisim' | 'logo' | 'fotograflar' | 'urun';

// Tanıtım yazısının "dolu" sayılması için en az bu kadar karakter olmalı;
// tek kelimelik bir yazı firma sayfasını tanıtmıyor.
export const MIN_ABOUT_LENGTH = 40;

export interface CompanySetupStepState {
  key: CompanySetupStepKey;
  // Ekranın üstünde ve şeritte görünen kısa ad.
  title: string;
  done: boolean;
}

export interface CompanyCompletenessInput {
  about?: string | null;
  companyType?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  city?: string | null;
  logoUpdatedAt?: string | null;
  officePhotoCount?: number | null;
  // Firmanın ürün sayısı (fetchCompany yanıtındaki products dizisinin uzunluğu).
  productCount?: number | null;
  // Konfeksiyon / fason atölye: Üretim sekmesi bilgileri (yüklenmediyse verilmez; o zaman sayılmaz).
  production?: CompanyProduction | null;
  productionReferenceCount?: number | null;
}

// Üretim sekmesinin tamamlanma maddeleri (docs/konfeksiyon-plani.md Bölüm A, madde 3).
export type ProductionItemKey = 'gruplar' | 'uzmanlik' | 'kapasite' | 'moq' | 'termin' | 'hizmet' | 'sertifika' | 'referans';

export interface ProductionItemState {
  key: ProductionItemKey;
  title: string;
  done: boolean;
}

export interface CompanyCompleteness {
  steps: CompanySetupStepState[];
  doneCount: number;
  total: number;
  // 0-100 arası tam sayı.
  percent: number;
  // Tamamlanmamış ilk adım; hepsi tamamsa null.
  firstIncomplete: CompanySetupStepKey | null;
  // Üretim maddeleri (yalnız konfeksiyon / fason atölye ve üretim bilgisi verildiyse; yoksa boş).
  productionItems: ProductionItemState[];
}

function productionItems(companyType: string | null | undefined, p: CompanyProduction | null | undefined, refs: number): ProductionItemState[] {
  if (!p || !hasProductionTab(companyType)) return [];
  const atolye = companyType === 'fason_atolye';
  const items: [ProductionItemKey, string, boolean][] = [
    ['gruplar', tr('Ürün grupları'), p.productGroups.length > 0],
    ['uzmanlik', tr('Ana uzmanlık'), p.mainGroups.length > 0],
    ['kapasite', tr('Aylık kapasite'), p.monthlyCapacity != null || Object.keys(p.capacityByGroup).length > 0],
    ['moq', tr('Minimum sipariş'), p.moqPerModel != null || p.moqPerColor != null],
    ['termin', tr('Termin'), p.sampleLeadDays != null && p.productionLeadDays != null],
    ['hizmet', atolye ? tr('Yapılan işlemler') : tr('Hizmetler'), (atolye ? p.operations : p.services).length > 0],
    ['sertifika', tr('Sertifika'), p.certificates.length > 0],
    ['referans', tr('Referans işler'), refs > 0],
  ];
  return items.map(([key, title, done]) => ({ key, title, done }));
}

export const COMPANY_SETUP_STEP_TITLES: Record<CompanySetupStepKey, string> = {
  get tanitim() {
    return tr('Tanıtım');
  },
  get iletisim() {
    return tr('İletişim ve adres');
  },
  get logo() {
    return tr('Logo');
  },
  get fotograflar() {
    return tr('Fotoğraflar');
  },
  get urun() {
    return tr('Ekip ve ilk ürün');
  },
};

export const COMPANY_SETUP_STEP_ORDER: CompanySetupStepKey[] = [
  'tanitim',
  'iletisim',
  'logo',
  'fotograflar',
  'urun',
];

export function isCompanySetupStepKey(value: unknown): value is CompanySetupStepKey {
  return typeof value === 'string' && (COMPANY_SETUP_STEP_ORDER as string[]).includes(value);
}

const filled = (value: string | null | undefined) => (value ?? '').trim().length > 0;

export function companyCompleteness(input: CompanyCompletenessInput): CompanyCompleteness {
  const done: Record<CompanySetupStepKey, boolean> = {
    // Hakkında yazısı yeterince uzun VE şirket tipi seçilmiş.
    tanitim: (input.about ?? '').trim().length >= MIN_ABOUT_LENGTH && filled(input.companyType),
    // E-posta ya da telefondan en az biri VE şehir.
    iletisim: (filled(input.contactEmail) || filled(input.contactPhone)) && filled(input.city),
    logo: filled(input.logoUpdatedAt),
    // Sertifika isteğe bağlı; en az bir ofis/üretim fotoğrafı yeterli.
    fotograflar: (input.officePhotoCount ?? 0) > 0,
    urun: (input.productCount ?? 0) > 0,
  };

  const steps = COMPANY_SETUP_STEP_ORDER.map((key) => ({
    key,
    title: COMPANY_SETUP_STEP_TITLES[key],
    done: done[key],
  }));
  const prodItems = productionItems(input.companyType, input.production, input.productionReferenceCount ?? 0);
  const doneCount = steps.filter((s) => s.done).length + prodItems.filter((i) => i.done).length;
  const total = steps.length + prodItems.length;
  return {
    steps,
    doneCount,
    total,
    percent: Math.round((doneCount / total) * 100),
    firstIncomplete: steps.find((s) => !s.done)?.key ?? null,
    productionItems: prodItems,
  };
}
