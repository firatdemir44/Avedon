// Avedon MVP - temel veri modeli
// Bkz. avedon-mvp-spec.md bölüm 4.1 - 4.4

export type AccountType = 'konfeksiyon' | 'uretici' | 'bireysel';

export type VerificationStatus = 'dogrulanmamis' | 'inceleniyor' | 'dogrulanmis';

export interface User {
  id: string;
  accountType: AccountType;
  position: string; // örn. "Firma Yetkili Temsilcisi", "Yönetici/Tasarımcı"
  firstName: string;
  lastName: string;
  phone: string;
  phoneVerified: boolean;
  isAdmin: boolean;
  companyId: string | null;
}

export interface Company {
  id: string;
  name: string;
  taxId: string;
  about: string;
  contactEmail: string;
  contactPhone: string;
  productCategories: string[];
  employeeIds: string[];
  verification: VerificationStatus;
  companyCode: string; // kayıt sırasında çalışanların katılması için
}

export type ProductType = 'raschel' | 'orme' | 'dokuma' | 'diger';

export interface Product {
  id: string;
  companyId: string;
  code: string;
  type: ProductType;
  stock: number; // metre veya kg
  weightGsm: number; // gramaj (gr/m2)
  widthCm: number; // en (cm)
  content: string; // içerik, örn. "%95 Pamuk %5 Elastan"
  useArea: string; // kullanım alanı, örn. "Spor Giyim"
  imageUrl?: string;
}

export type SampleRequestStatus = 'talep_edildi' | 'onaylandi' | 'hazirlandi' | 'teslim_edildi';

export interface SampleRequest {
  id: string;
  productId: string;
  requesterId: string;
  deliveryPreference: string;
  status: SampleRequestStatus;
  createdAt: string;
}
