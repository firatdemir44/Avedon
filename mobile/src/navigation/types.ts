import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ProductFilters } from '../features/products/filters';
import type { PassportImport } from '../features/products/passportImport';
import type { ExtractOutcome, UserExperience } from '../api/client';
import type { YarnDirectoryPreset } from '../screens/yarns/YarnDirectoryScreen';
import type { RfqSelectionItem } from '../features/quotes/rfqSelection';

// ÖNEMLİ: Hiçbir rota adı hem sekme hem yığın listesinde bulunamaz.
// React Navigation, navigate çağrısını önce çağıran ekranın KENDİ navigatörüne
// gönderiyor; aynı ad iki yerde olursa (örn. "Profile") akıştaki bir kişinin
// adına dokununca sekme yakalayıp kendi profilini açardı. Bu yüzden kendi
// profil rotasının adı "MyProfile" (2026-09-21'de alt sekmeden çıkıp kök
// yığına taşındı: üst başlıktaki yuvarlak profil düğmesinden açılıyor).
export type MainTabParamList = {
  Feed: undefined;
  // Filtre ekranı "Uygula"da filtreleri buraya geri gönderir; appliedAt her
  // uygulamada değişir, aynı filtre ikinci kez uygulansa da ekran yenilenir.
  // initialSearch: genel aramadaki "Tümünü gör" bu metinle açar; searchKey
  // her açılışta değişir ki aynı metin ikinci kez de uygulansın.
  ProductList:
    | { filters?: ProductFilters; appliedAt?: number; initialSearch?: string; searchKey?: number }
    | undefined;
  // Firma asistanı (Faz 1, Adım 5). Rota adı "AssistantTab": yığındaki
  // asistan ekranlarıyla (AssistantThreads, AssistantMemory) çakışmasın.
  AssistantTab: undefined;
  Conversations: undefined;
  // Hesaplayıcı ızgarası (Fırat 2026-09-21): Profil alt çubuktan çıkınca
  // hesaplamalar beşinci sekme olarak geri geldi. Rota adı "Calculators";
  // kök yığındaki eski "CalculatorsList" kaydı kalktı.
  Calculators: undefined;
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
  // Kendi profilim ve menü merkezi. 2026-09-21'de alt sekmeden çıkıp buraya
  // geldi: ortak üst başlıktaki yuvarlak profil düğmesi açar.
  MyProfile: undefined;
  // Üst başlıktaki "Arama Yap" kutusu: tek kutudan firma, kumaş ve iplik
  // (GET /api/search). Oturumsuz da çalışır.
  GlobalSearch: undefined;
  Admin: undefined;
  // Firma doğrulama başvurusu (firma tarafı, 2026-09-22): durum + belge yükleme.
  // Yönetici tarafı "Admin" ekranının "Başvurular" sekmesinde.
  Verification: undefined;
  // initialTab: kapasite aramasından gelindiğinde "Makine parkı" sekmesi açık
  // gelsin diye (Faz 2, Adım 5).
  // focus: 'references' — referans bildiriminden gelindiğinde Hakkında
  // sekmesinde Referanslar bölümü en üste alınır (Faz 2, Adım 7).
  CompanyProfile:
    | {
        companyId?: string;
        initialTab?: 'about' | 'products' | 'feed' | 'people' | 'machines';
        focus?: 'references';
      }
    | undefined;
  EditCompany: { companyId: string };
  // Adım adım firma sayfası kurulumu (Aşama B). step verilmezse tamamlanmamış
  // ilk adımdan başlar; anahtarlar features/companies/completeness.ts içinde.
  CompanySetup: { step?: string } | undefined;
  // passportImport: etiket okuma onay ekranından aktarılan alanlar. importKey
  // her aktarımda değişir; aynı öneri ikinci kez aktarılsa da formun haberi olur.
  // draftId: WhatsApp'tan gelen ürün taslağı. Ekran açılışında taslağı çeker,
  // fotoğrafını ilk ürün fotoğrafı olarak önerir ve çıkarım sonucunu
  // PassportReview onay ekranına gönderir (etiketten doldurmayla aynı yol).
  AddProduct:
    | { productId?: string; passportImport?: PassportImport; importKey?: number; draftId?: string }
    | undefined;
  // Etiketten okunanların onay ekranı (ürün formundan açılır, forma geri döner).
  PassportReview: { productId?: string; outcome: ExtractOutcome };
  // WhatsApp'tan gelen, henüz kullanılmamış ürün taslakları (firma sayfasından
  // ve bildirimden açılır).
  ProductDrafts: undefined;
  ProductDetail: { productId: string };
  // mode 'watch': aynı ekran "izleme kipinde" açılır (Faz 2, Adım 1) — alttaki
  // düğme "Bu süzgeci izle" olur ve sonuç Ürünler'e değil izleme kuralına gider.
  ProductFilters: { filters: ProductFilters; mode?: 'watch' };
  // Fotoğrafla benzer kumaş arama (Faz 3, Adım 3). Parametre almaz: fotoğraf
  // ekranın içinde seçilir, sonuç da ekranda kalır.
  SimilarSearch: undefined;
  // Bildirimler ve izleme kuralları (Faz 2, Adım 1). Push bildirimi yok,
  // yalnızca uygulama içi.
  Notifications: undefined;
  WatchRules: undefined;
  FavoriteProducts: undefined;
  RecentlyViewedProducts: undefined;
  // Asistanın sohbet geçmişi ve firma hafızası (asistan sekmesinden açılır).
  AssistantThreads: undefined;
  AssistantMemory: undefined;
  // Satıcı asistanı (Faz 2, Adım 3): BAŞKA bir firmanın asistanıyla sohbet.
  // companyName bildirimden gelmeyebilir; o zaman başlık "Firma asistanı" olur
  // ve iplik açılınca sunucudan gelen adla değişir. productCode verilirse ilk
  // örnek soru o ürünle ilgili olur.
  SellerAssistant: { companyId: string; companyName?: string; productCode?: string };
  // Satıcı tarafı: asistana gelen sorular ve sık sorulanlar yönetimi.
  CompanyQuestions: undefined;
  CompanyFaq: undefined;
  // Makine parkı ve fason kapasite (Faz 2, Adım 5). MachinePark: kendi firmanın
  // parkuru + aylık tonaj; MachineForm: tek makine ekle/düzenle;
  // CapacitySearch: "28 fayn 30 pus süprem örecek fason" araması.
  MachinePark: undefined;
  MachineForm: { machineId?: string } | undefined;
  CapacitySearch: undefined;
  // İplik dizini (Faz 2, Adım 6). preset: kumaş pasaportundaki "Kim satıyor?"
  // bağlantısı dizini o numara/birimle ön dolu açar; presetKey her açılışta
  // değişir ki aynı ön dolgu ikinci kez de uygulansın.
  YarnDirectory: { preset?: YarnDirectoryPreset; presetKey?: number } | undefined;
  // yarnId verilirse düzenleme kipinde açılır (iplik detayındaki "Düzenle").
  YarnForm: { yarnId?: string } | undefined;
  // Hesaplayıcı listesi alt çubuktaki "Hesaplamalar" sekmesinde
  // (MainTabParamList.Calculators); tek tek hesaplar yığında kalır.
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
  // Çoklu teklif isteme ve karşılaştırma (Faz 3, Adım 1). Form seçilen
  // ürünlerin ÖZETİNİ alır (id'lerden yeniden veri çekmemek için).
  // prefill: asistanın "teklif_topla" kartından gelindiğinde miktar/termin/not
  // forma ön dolu gelir (Faz 3, Adım 2).
  RfqForm: {
    items: RfqSelectionItem[];
    prefill?: { quantity?: number; unit?: 'm' | 'kg'; targetDate?: string; note?: string };
  };
  RfqCompare: { rfqId: string };
  // Sipariş kaydı ve karşılıklı değerlendirme (Faz 3, Adım 4). Kayıt kabul
  // edilen tekliften doğar; platform ödeme almaz, sevkiyat izlemez.
  DealDetail: { dealId: string };
  // role: hangi sekme açık gelsin (firması olmayanda yalnızca 'buyer').
  Deals: { role?: 'buyer' | 'seller' } | undefined;
  GarmentVisualCost: undefined;
  Profile: { userId: string };
  // Kişi profili düzenleme (LinkedIn benzeri başlık, 2026-09-22). Alanlar
  // profil ekranından ön dolu gelir; kaydedince geri dönülür.
  ProfileEdit: { headline?: string; location?: string; about?: string } | undefined;
  // Deneyim ekle/düzenle. experience verilirse düzenleme kipi (sil düğmesiyle).
  ExperienceForm: { experience?: UserExperience } | undefined;
  Connections: undefined;
  ConnectionRequests: undefined;
  // Davetler (Faz 2, Adım 4): "tedarikçini / müşterini davet et". Davet
  // oluşturma formu + Davetlerim listesi tek ekranda.
  Invites: undefined;
  // userId/avatarUpdatedAt: başlıktaki kişi avatarı için (eski bağlantılarda
  // olmayabilir; yoksa yalnızca ad yazılır).
  Chat: { conversationId: string; title: string; userId?: string; avatarUpdatedAt?: string | null };
  NewConversation: undefined;
  // postId verilirse ekran düzenleme modunda açılır. productId: ürün sayfasındaki
  // "Gönderide Paylaş"tan gelindiğinde o ürün seçili açılır.
  // pickedAt: aynı ürün ikinci kez seçilince de ekranın haberi olsun diye.
  CreatePost: { postId?: string; productId?: string; pickedAt?: number } | undefined;
  SelectProduct: { selectedId?: string } | undefined;
  PostComments: { postId: string };
  // Yalnızca geliştirme: src/ui bileşen galerisi. Menüde yok, elle gezinilir
  // (web'de tarayıcıdan). Tasarım sistemini açık/koyu temada görmek için.
  UiGallery: undefined;
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
