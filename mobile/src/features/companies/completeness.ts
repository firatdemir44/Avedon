import { tr } from '../../i18n';
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
}

export interface CompanyCompleteness {
  steps: CompanySetupStepState[];
  doneCount: number;
  total: number;
  // 0-100 arası tam sayı.
  percent: number;
  // Tamamlanmamış ilk adım; hepsi tamamsa null.
  firstIncomplete: CompanySetupStepKey | null;
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
  const doneCount = steps.filter((s) => s.done).length;
  const total = steps.length;
  return {
    steps,
    doneCount,
    total,
    percent: Math.round((doneCount / total) * 100),
    firstIncomplete: steps.find((s) => !s.done)?.key ?? null,
  };
}
