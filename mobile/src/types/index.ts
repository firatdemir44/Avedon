// Avedon MVP - temel veri modeli
// Bkz. avedon-mvp-spec.md bölüm 4.1 - 4.4
import type { ProductType, StockUnit } from '../features/products/catalog';
import type { WidthType } from '../features/products/glossaryLabels';

export type { ProductType, StockUnit };

// --- Kumaş pasaportu (Faz 1) ---
// Sunucu sözleşmesi: backend/src/passport.ts toPassportRow.

// Lif anahtarı features/products/glossaryLabels.ts FIBERS içinde.
export interface CompositionItem {
  fiber: string;
  percent: number;
}

// Fiyat YALNIZCA ürünün sahibi firmaya döner; başkasının yanıtında alan hiç
// gelmez (null bile değil), o yüzden Product'ta isteğe bağlı.
export interface ProductPrice {
  value: number;
  currency: string; // catalog.ts PRICE_CURRENCIES
  unit: string; // '' | 'm' | 'kg'
}

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
  // Doğrulamanın nasıl yapıldığı (Faz 2, Adım 7): '' = düzey belirtilmemiş,
  // 'belge' = vergi levhası/ticaret sicili incelendi, 'ziyaret' = yerinde görüldü.
  // Eski sunucu sürümleri bu alanları göndermiyor olabilir, o yüzden isteğe bağlı.
  verificationLevel?: '' | 'belge' | 'ziyaret' | (string & {});
  verifiedAt?: string | null;
  companyCode: string; // kayıt sırasında çalışanların katılması için
  // Firma sayfası "Şirket Genel Bakışı" (Aşama B). companyType anahtarı
  // features/products/catalog.ts COMPANY_TYPES; boş = belirtilmemiş.
  companyType: string;
  foundedYear: number | null;
  website: string;
  city: string;
  district: string;
  address: string;
  mainMarkets: string;
  // Galeri fotoğraflarının kendisi yanıtta gelmez; sayıları gelir ve
  // fotoğraflar GET /api/companies/:id/photos/:kind/:position ile çekilir.
  officePhotoCount?: number;
  certificatePhotoCount?: number;
  // Logonun kendisi ayrıca çekilir; bu alan hem "logo var mı" hem önbellek anahtarı.
  logoUpdatedAt: string | null;
}

export interface Product {
  id: string;
  companyId: string;
  code: string;
  // Katalog anahtarları: features/products/catalog.ts
  type: ProductType;
  subtype: string; // alt çeşit, boş = belirtilmemiş
  usages: string[]; // kullanım amaçları
  stock: number;
  stockUnit: StockUnit;
  weightGsm: number; // gramaj (gr/m2)
  widthCm: number; // en (cm)
  content: string; // içerik, örn. "%95 Pamuk %5 Elastan"
  useArea: string; // serbest kullanım notu (isteğe bağlı)
  // Fotoğrafların kendisi hiçbir liste/detay yanıtında gelmez; kapak
  // GET /api/products/:id/image, galeri /images/:position ile ayrıca çekilir.
  hasImage: boolean;
  imageCount: number;
  // Giriş yapılmış isteklerde dolu.
  isFavorite?: boolean;
  company?: { id: string; name: string; verification: VerificationStatus; logoUpdatedAt: string | null };

  // --- Pasaport alanları (liste ve detay yanıtlarında gelir) ---
  // Eski sunucuya ya da yerel örnek veriye karşı dayanıklı olsun diye hepsi
  // isteğe bağlı; ekranlar boş değerle çalışmalı.
  widthType?: '' | WidthType;
  // Girilen enin anlamı: '' | 'acik' | 'tup_tek_yuz' (glossaryLabels).
  widthMeaning?: string;
  // Sunucunun hesapladığı açık en: tup_tek_yuz ise widthCm × 2.
  effectiveWidthCm?: number;
  moq?: number | null;
  // Stok biriminden BAĞIMSIZ (kullanıcı kararı 2026-09-16).
  moqUnit?: '' | StockUnit;
  leadTimeDays?: number | null;
  // catalog.ts FINISH_TAGS anahtarları
  finishTags?: string[];
  passportUpdatedAt?: string | null;
  composition?: CompositionItem[];
  // glossaryLabels.ts CERTIFICATES anahtarları
  certificateNames?: string[];
  // Çıkarımdan gelip henüz onaylanmamış alan sayısı (sahibi için uyarı şeridi).
  pendingFieldCount?: number;
  // Yalnızca sahibine gelir.
  price?: ProductPrice | null;
}

export type SampleRequestStatus = 'talep_edildi' | 'onaylandi' | 'hazirlandi' | 'teslim_edildi';

// Son adımın ETİKETİ teslimat moduna göre değişir ("Teslim Edildi" / "Kurye
// Teslim Aldı") ama statü tektir. Etiketlerin tamamını sunucu üretiyor —
// istemcide ikinci bir kopya tutulursa ikisi zamanla birbirinden ayrılır.
export type DeliveryMode = 'seller_ships' | 'customer_courier';

export interface SampleRequest {
  id: string;
  productId: string;
  requesterId: string;
  deliveryMode: DeliveryMode;
  note: string;
  status: SampleRequestStatus;
  createdAt: string;
}
