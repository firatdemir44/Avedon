// Avedon MVP - temel veri modeli
// Bkz. avedon-mvp-spec.md bölüm 4.1 - 4.4
import type { ProductType, StockUnit } from '../features/products/catalog';

export type { ProductType, StockUnit };

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
