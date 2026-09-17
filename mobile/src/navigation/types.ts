import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ProductFilters } from '../features/products/filters';
import type { PassportImport } from '../features/products/passportImport';
import type { ExtractOutcome } from '../api/client';

// ÖNEMLİ: Hiçbir rota adı hem sekme hem yığın listesinde bulunamaz.
// React Navigation, navigate çağrısını önce çağıran ekranın KENDİ navigatörüne
// gönderiyor; aynı ad iki yerde olursa (örn. "Profile") akıştaki bir kişinin
// adına dokununca sekme yakalayıp kendi profilini açardı. Bu yüzden sekmedeki
// profil rotasının adı "MyProfile".
export type MainTabParamList = {
  Feed: undefined;
  // Filtre ekranı "Uygula"da filtreleri buraya geri gönderir; appliedAt her
  // uygulamada değişir, aynı filtre ikinci kez uygulansa da ekran yenilenir.
  ProductList: { filters?: ProductFilters; appliedAt?: number } | undefined;
  // Firma asistanı (Faz 1, Adım 5). Rota adı "AssistantTab": yığındaki
  // asistan ekranlarıyla (AssistantThreads, AssistantMemory) çakışmasın.
  AssistantTab: undefined;
  Conversations: undefined;
  MyProfile: undefined;
};

export type RootStackParamList = {
  // Giriş yapılmamış akış
  RoleSelection: undefined;
  Login: undefined;
  Position: undefined;
  PersonalInfo: undefined;
  CompanyInfo: undefined;
  PhoneVerification: undefined;
  CompanyCode: undefined;
  // Giriş yapılmış ana yapı
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  // Üste itilen ekranlar
  Admin: undefined;
  CompanyProfile: { companyId?: string } | undefined;
  EditCompany: { companyId: string };
  // Adım adım firma sayfası kurulumu (Aşama B). step verilmezse tamamlanmamış
  // ilk adımdan başlar; anahtarlar features/companies/completeness.ts içinde.
  CompanySetup: { step?: string } | undefined;
  // passportImport: etiket okuma onay ekranından aktarılan alanlar. importKey
  // her aktarımda değişir; aynı öneri ikinci kez aktarılsa da formun haberi olur.
  AddProduct: { productId?: string; passportImport?: PassportImport; importKey?: number } | undefined;
  // Etiketten okunanların onay ekranı (ürün formundan açılır, forma geri döner).
  PassportReview: { productId?: string; outcome: ExtractOutcome };
  ProductDetail: { productId: string };
  // mode 'watch': aynı ekran "izleme kipinde" açılır (Faz 2, Adım 1) — alttaki
  // düğme "Bu süzgeci izle" olur ve sonuç Ürünler'e değil izleme kuralına gider.
  ProductFilters: { filters: ProductFilters; mode?: 'watch' };
  // Bildirimler ve izleme kuralları (Faz 2, Adım 1). Push bildirimi yok,
  // yalnızca uygulama içi.
  Notifications: undefined;
  WatchRules: undefined;
  FavoriteProducts: undefined;
  RecentlyViewedProducts: undefined;
  // Asistanın sohbet geçmişi ve firma hafızası (asistan sekmesinden açılır).
  AssistantThreads: undefined;
  AssistantMemory: undefined;
  // Hesaplayıcı listesi artık sekmede değil, yığında: alt menüdeki yeri
  // "Asistan"a geçti, listeye asistandaki "Tüm hesaplayıcılar" çipinden gelinir.
  CalculatorsList: undefined;
  FabricCostCalculator: undefined;
  GarmentCostCalculator: undefined;
  YarnCountCalculator: undefined;
  YarnUsageCalculator: undefined;
  YarnRatioCalculator: undefined;
  FabricWeightCalculator: undefined;
  ProductionCalculator: undefined;
  SampleRequestForm: { productId: string; productCode: string };
  SampleRequestTracking: { sampleRequestId: string };
  MySampleRequests: undefined;
  IncomingSampleRequests: undefined;
  // Teklif akışı (Faz 2, Adım 2). stockUnit: formdaki birim ürünün stok
  // birimiyle açılır (bilinmiyorsa metre).
  QuoteRequestForm: { productId: string; productCode: string; stockUnit?: 'm' | 'kg' };
  QuoteRequestDetail: { requestId: string };
  // role: hangi sekme açık gelsin (firması olmayanda yalnızca 'buyer').
  QuoteRequests: { role?: 'buyer' | 'seller' } | undefined;
  GarmentVisualCost: undefined;
  Profile: { userId: string };
  Connections: undefined;
  ConnectionRequests: undefined;
  Chat: { conversationId: string; title: string };
  NewConversation: undefined;
  // postId verilirse ekran düzenleme modunda açılır. productId: ürün sayfasındaki
  // "Gönderide Paylaş"tan gelindiğinde o ürün seçili açılır.
  // pickedAt: aynı ürün ikinci kez seçilince de ekranın haberi olsun diye.
  CreatePost: { postId?: string; productId?: string; pickedAt?: number } | undefined;
  SelectProduct: { selectedId?: string } | undefined;
  PostComments: { postId: string };
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

// Sekme ekranları hem kendi sekme navigatörüne hem de üstteki yığına
// gezinebilmeli (örn. Akış'tan Chat'e) — CompositeScreenProps bunu sağlıyor.
export type MainTabScreenProps<T extends keyof MainTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;
