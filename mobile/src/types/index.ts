// Takyon MVP - temel veri modeli
// Bkz. takyon-mvp-spec.md bölüm 4.1 - 4.4
import type { AnyProductType, ProductType, StockUnit } from '../features/products/catalog';
import type { WidthType } from '../features/products/glossaryLabels';

export type { AnyProductType, ProductType, StockUnit };

// --- İplik dizini (Faz 2, Adım 6) ---
// Sunucu sözleşmesi: backend/src/yarns.ts toYarnSpecRow. İplik de bir üründür
// (type === 'iplik', stockUnit 'kg', weightGsm/widthCm 0); kumaşa özel alanlar
// anlamsızdır, bunun yerine bu satır dolu gelir.
export interface YarnSpec {
  // catalog anahtarları: features/yarns/catalog.ts
  family: string;
  count: number;
  countUnit: string;
  ply: number;
  // Tek katın dtex karşılığı; birimden bağımsız karşılaştırma ve çevrim için.
  countDtex: number;
  filaments: number | null;
  spinning: string;
  combing: string;
  filamentType: string;
  luster: string;
  twistDirection: '' | 'S' | 'Z' | (string & {});
  twistTpm: number | null;
  endUses: string[];
  colorState: string;
  color: string;
  variety: string;
  origin: string;
  brand: string;
  coneWeightKg: number | null;
  sellerRole: string;
  // Sunucunun ürettiği okunur metinler: "30/1 Ne", "150/48 denye".
  countLabel: string;
  // "30/1 Ne Penye Kompakt Pamuk"
  summary: string;
}

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
  // Kişisel profil fotoğrafının son yüklenme anı; null/yok = fotoğraf yok.
  // Fotoğrafın kendisi kullanıcı yanıtlarında gelmez, ayrı uçtan çekilir ve bu
  // değer önbellek anahtarıdır (firma logosundaki logoUpdatedAt ile aynı desen).
  avatarUpdatedAt?: string | null;
}

export interface Company {
  id: string;
  name: string;
  // Firma rehberi: dernek listesinden içe aktarılan firmalar false (sahipsiz).
  claimed?: boolean;
  // Yalnızca firmanın kendi çalışanlarına döner; kayıtta atlanmışsa ''.
  taxId?: string;
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
  // Katalog anahtarları: features/products/catalog.ts. 'iplik' de olabilir
  // (Faz 2, Adım 6) — o zaman aşağıdaki `yarn` dolu, kumaş alanları boştur.
  type: AnyProductType;
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
  // --- AB Dijital Ürün Pasaportu'na hazırlık (Faz 3, Adım 7) ---
  // Üçü de isteğe bağlı; eski sunucu bu alanları hiç göndermez.
  originCountry?: string;
  // Eski kayıtlarda serbest metin bakım bilgisi; yeni kayıtlarda sembol kullanılır.
  careNotes?: string;
  // Bakım sembolü anahtarları (features/care/symbols.ts); grup başına en çok bir tane.
  careSymbols?: string[];
  // null / tanımsız: belirtilmedi. 0 geçerli bir değerdir.
  recycledPercent?: number | null;
  composition?: CompositionItem[];
  // glossaryLabels.ts CERTIFICATES anahtarları
  certificateNames?: string[];
  // Çıkarımdan gelip henüz onaylanmamış alan sayısı (sahibi için uyarı şeridi).
  pendingFieldCount?: number;
  // Yalnızca sahibine gelir.
  price?: ProductPrice | null;
  // İplikte dolu, kumaşta null. Eski sunucu bu alanı hiç göndermeyebilir.
  yarn?: YarnSpec | null;
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
