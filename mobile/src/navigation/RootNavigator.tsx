import React, { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DefaultTheme, NavigationContainer, useNavigationContainerRef, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import type { RootStackParamList } from './types';
import { MainTabs } from './MainTabs';
import { useSession } from '../context/SessionContext';
import { colors, typography } from '../theme';
import { RoleSelectionScreen } from '../screens/onboarding/RoleSelectionScreen';
import { PositionScreen } from '../screens/onboarding/PositionScreen';
import { PersonalInfoScreen } from '../screens/onboarding/PersonalInfoScreen';
import { CompanyInfoScreen } from '../screens/onboarding/CompanyInfoScreen';
import { PhoneVerificationScreen } from '../screens/onboarding/PhoneVerificationScreen';
import { CompanyCodeScreen } from '../screens/onboarding/CompanyCodeScreen';
import { CompanyProfileScreen } from '../screens/company/CompanyProfileScreen';
import { EditCompanyScreen } from '../screens/company/EditCompanyScreen';
import { CompanySetupScreen } from '../screens/company/CompanySetupScreen';
import { AddProductScreen } from '../screens/company/AddProductScreen';
import { PassportReviewScreen } from '../screens/company/PassportReviewScreen';
import { ProductDraftsScreen } from '../screens/company/ProductDraftsScreen';
import { ProductDetailScreen } from '../screens/products/ProductDetailScreen';
import { ProductFiltersScreen } from '../screens/products/ProductFiltersScreen';
import { SimilarSearchScreen } from '../screens/products/SimilarSearchScreen';
import { FavoriteProductsScreen } from '../screens/products/FavoriteProductsScreen';
import { RecentlyViewedProductsScreen } from '../screens/products/RecentlyViewedProductsScreen';
import { NotificationsScreen } from '../screens/notifications/NotificationsScreen';
import { WatchRulesScreen } from '../screens/notifications/WatchRulesScreen';
import { AssistantThreadsScreen } from '../screens/assistant/AssistantThreadsScreen';
import { AssistantMemoryScreen } from '../screens/assistant/AssistantMemoryScreen';
import { SellerAssistantScreen } from '../screens/assistant/SellerAssistantScreen';
import { CompanyQuestionsScreen } from '../screens/assistant/CompanyQuestionsScreen';
import { CompanyFaqScreen } from '../screens/assistant/CompanyFaqScreen';
import { MachineParkScreen } from '../screens/machines/MachineParkScreen';
import { MachineFormScreen } from '../screens/machines/MachineFormScreen';
import { CapacitySearchScreen } from '../screens/machines/CapacitySearchScreen';
import { YarnDirectoryScreen } from '../screens/yarns/YarnDirectoryScreen';
import { YarnFormScreen } from '../screens/yarns/YarnFormScreen';
import { FabricCostCalculator } from '../screens/calculators/FabricCostCalculator';
import { GarmentCostCalculator } from '../screens/calculators/GarmentCostCalculator';
import { YarnCountCalculator } from '../screens/calculators/YarnCountCalculator';
import { YarnUsageCalculator } from '../screens/calculators/YarnUsageCalculator';
import { YarnRatioCalculator } from '../screens/calculators/YarnRatioCalculator';
import { FabricWeightCalculator } from '../screens/calculators/FabricWeightCalculator';
import { ProductionCalculator } from '../screens/calculators/ProductionCalculator';
import { SampleRequestFormScreen } from '../screens/samples/SampleRequestFormScreen';
import { SampleRequestTrackingScreen } from '../screens/samples/SampleRequestTrackingScreen';
import { MySampleRequestsScreen } from '../screens/samples/MySampleRequestsScreen';
import { IncomingSampleRequestsScreen } from '../screens/samples/IncomingSampleRequestsScreen';
import { QuoteRequestFormScreen } from '../screens/quotes/QuoteRequestFormScreen';
import { QuoteRequestDetailScreen } from '../screens/quotes/QuoteRequestDetailScreen';
import { QuoteRequestsScreen } from '../screens/quotes/QuoteRequestsScreen';
import { DealDetailScreen } from '../screens/deals/DealDetailScreen';
import { DealsScreen } from '../screens/deals/DealsScreen';
import { RfqFormScreen } from '../screens/quotes/RfqFormScreen';
import { RfqCompareScreen } from '../screens/quotes/RfqCompareScreen';
import { GarmentVisualCostScreen } from '../screens/visualCosting/GarmentVisualCostScreen';
import { LoginScreen } from '../screens/onboarding/LoginScreen';
import { AdminScreen } from '../screens/admin/AdminScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { MyProfileScreen } from '../screens/profile/MyProfileScreen';
import { GlobalSearchScreen } from '../screens/search/GlobalSearchScreen';
import { ConnectionsListScreen } from '../screens/connections/ConnectionsListScreen';
import { ConnectionRequestsScreen } from '../screens/connections/ConnectionRequestsScreen';
import { InvitesScreen } from '../screens/invites/InvitesScreen';
import { ChatScreen, ChatHeaderTitle } from '../screens/messages/ChatScreen';
import { NewConversationScreen } from '../screens/messages/NewConversationScreen';
import { CreatePostScreen } from '../screens/feed/CreatePostScreen';
import { SelectProductScreen } from '../screens/feed/SelectProductScreen';
import { PostCommentsScreen } from '../screens/feed/PostCommentsScreen';
import { readPushTargetFromUrl, subscribeToPushOpen, type PushTarget } from '../features/push/pushOpen';
import { resyncPushSubscription } from '../features/push/webPush';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Varsayılan tema iOS mavisi kullanıyor; sekme çubuğu ve başlıklar uygulamanın
// kendi paletiyle uyumlu olsun diye eziyoruz.
const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
  },
};

export function RootNavigator() {
  const { user, isRestoring } = useSession();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  // Uygulama kapalıyken bildirime dokunulduysa hedef adres çubuğundan gelir;
  // gezinme ağacı hazır olana kadar burada bekler.
  const pendingTarget = useRef<PushTarget | null>(null);
  const isReady = useRef(false);

  // Bildirime dokunma yönlendirmesi (web): mesaj bildirimi sohbete/Mesajlar
  // sekmesine, diğer her tür Bildirimler ekranına. Oturum yoksa hiçbir şey
  // yapılmaz.
  const goToTarget = useCallback(
    (target: PushTarget) => {
      const nav = navigationRef;
      if (!isReady.current || !nav.isReady()) {
        pendingTarget.current = target;
        return;
      }
      try {
        if (target.kind === 'message') {
          // Sunucu bildirim verisine gönderenin adını (title) da koyar; varsa doğrudan
          // sohbet açılır, yoksa Mesajlar sekmesi.
          const d = (target.data ?? {}) as { conversationId?: unknown; userId?: unknown; title?: unknown };
          nav.navigate('MainTabs', { screen: 'Conversations' });
          if (typeof d.conversationId === 'string' && typeof d.title === 'string' && d.title) {
            nav.navigate('Chat', { conversationId: d.conversationId, title: d.title, userId: typeof d.userId === 'string' ? d.userId : undefined });
          }
          return;
        }
        nav.navigate('Notifications');
      } catch {
        // Sessiz: yönlendirme başarısız olsa da uygulama açık kalır.
      }
    },
    [navigationRef]
  );

  // Oturum açıkken: servis çalışanından gelen dokunmaları dinle ve açılıştaki
  // `?bildirim=` parametresini oku. Ayrıca tarayıcıdaki abonelik sunucuya
  // sessizce yeniden bildirilsin (başka hesaba geçmiş ya da silinmiş olabilir).
  useEffect(() => {
    if (!user) {
      pendingTarget.current = null;
      return;
    }
    void resyncPushSubscription();
    const unsubscribe = subscribeToPushOpen(goToTarget);
    const initial = readPushTargetFromUrl();
    if (initial) goToTarget(initial);
    return unsubscribe;
  }, [user, goToTarget]);

  if (isRestoring) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navigationTheme}
      onReady={() => {
        isReady.current = true;
        const waiting = pendingTarget.current;
        pendingTarget.current = null;
        if (waiting) goToTarget(waiting);
      }}
    >
      {/* Girişten sonra her ekranın üstü lacivert bant: saat/pil beyaz. Kayıt
          ekranları açık zeminde, orada koyu. */}
      <StatusBar style={user ? 'light' : 'dark'} />
      {/* Giriş durumuna göre iki ayrı ağaç render ediliyor: giriş/çıkış sonrası
          ayrıca gezinme çağrısı gerekmiyor ve kayıt biten kullanıcı geri tuşuyla
          kayıt adımlarına dönemiyor. */}
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          // İtilen ekranların başlıkları da sekmelerdeki gibi lacivert bant.
          headerTitleStyle: { ...typography.heading, color: colors.primaryText },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.primaryText,
        }}
      >
        {user ? (
          <Stack.Group>
            <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
            {/* 2026-09-21: profil alt sekmeden çıktı, ortak üst başlıktaki
                yuvarlak profil düğmesinden açılıyor (geri okuyla). */}
            <Stack.Screen
              name="MyProfile"
              component={MyProfileScreen}
              options={{ headerShown: true, title: 'Profilim' }}
            />
            {/* Üst başlıktaki "Arama Yap" kutusu. */}
            <Stack.Screen
              name="GlobalSearch"
              component={GlobalSearchScreen}
              options={{ headerShown: true, title: 'Arama' }}
            />
            <Stack.Screen
              name="CompanyProfile"
              component={CompanyProfileScreen}
              // Başlık ekranın kendisinde güncellenir: kendi firman "Firmam",
              // başka firma kendi adı.
              options={{ headerShown: true, title: 'Firma' }}
            />
            <Stack.Screen
              name="EditCompany"
              component={EditCompanyScreen}
              options={{ headerShown: true, title: 'Firmayı Düzenle' }}
            />
            <Stack.Screen
              name="CompanySetup"
              component={CompanySetupScreen}
              options={{ headerShown: true, title: 'Firma Sayfanı Tamamla' }}
            />
            <Stack.Screen
              name="AddProduct"
              component={AddProductScreen}
              options={{ headerShown: true, title: 'Ürün Ekle' }}
            />
            <Stack.Screen
              name="PassportReview"
              component={PassportReviewScreen}
              options={{ headerShown: true, title: 'Etiketten Okunanlar' }}
            />
            {/* WhatsApp'tan gelen ürün taslakları (bekleyenler). */}
            <Stack.Screen
              name="ProductDrafts"
              component={ProductDraftsScreen}
              options={{ headerShown: true, title: 'WhatsApp Taslakları' }}
            />
            <Stack.Screen
              name="ProductDetail"
              component={ProductDetailScreen}
              // Başlık ürün kodu olarak ekranın kendisi tarafından güncelleniyor.
              options={{ headerShown: true, title: 'Ürün' }}
            />
            <Stack.Screen
              name="ProductFilters"
              component={ProductFiltersScreen}
              options={{ headerShown: true, title: 'Filtrele' }}
            />
            {/* Faz 3, Adım 3: fotoğrafla benzer kumaş arama. */}
            <Stack.Screen
              name="SimilarSearch"
              component={SimilarSearchScreen}
              options={{ headerShown: true, title: 'Fotoğrafla Kumaş Ara' }}
            />
            <Stack.Screen
              name="FavoriteProducts"
              component={FavoriteProductsScreen}
              options={{ headerShown: true, title: 'Takip Ettiklerim' }}
            />
            <Stack.Screen
              name="RecentlyViewedProducts"
              component={RecentlyViewedProductsScreen}
              options={{ headerShown: true, title: 'Son Baktıklarım' }}
            />
            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
              options={{ headerShown: true, title: 'Bildirimler' }}
            />
            <Stack.Screen
              name="WatchRules"
              component={WatchRulesScreen}
              options={{ headerShown: true, title: 'İzlediklerim' }}
            />
            <Stack.Screen
              name="AssistantThreads"
              component={AssistantThreadsScreen}
              options={{ headerShown: true, title: 'Sohbetler' }}
            />
            <Stack.Screen
              name="AssistantMemory"
              component={AssistantMemoryScreen}
              options={{ headerShown: true, title: 'Firma Hafızası' }}
            />
            {/* Satıcı asistanı (Faz 2, Adım 3): başlık ekranın kendisinde
                firma adıyla ayarlanıyor. */}
            <Stack.Screen
              name="SellerAssistant"
              component={SellerAssistantScreen}
              options={{ headerShown: true, title: 'Firma asistanı' }}
            />
            <Stack.Screen
              name="CompanyQuestions"
              component={CompanyQuestionsScreen}
              options={{ headerShown: true, title: 'Asistana Gelen Sorular' }}
            />
            <Stack.Screen
              name="CompanyFaq"
              component={CompanyFaqScreen}
              options={{ headerShown: true, title: 'Sık Sorulanlar' }}
            />
            {/* Makine parkı ve fason kapasite (Faz 2, Adım 5). MachineForm
                başlığını ekranın kendisi ayarlıyor (ekle/düzenle). */}
            <Stack.Screen
              name="MachinePark"
              component={MachineParkScreen}
              options={{ headerShown: true, title: 'Makine Parkı' }}
            />
            <Stack.Screen
              name="MachineForm"
              component={MachineFormScreen}
              options={{ headerShown: true, title: 'Makine Ekle' }}
            />
            <Stack.Screen
              name="CapacitySearch"
              component={CapacitySearchScreen}
              options={{ headerShown: true, title: 'Fason Kapasite Ara' }}
            />
            {/* İplik dizini (Faz 2, Adım 6). YarnForm başlığını ekranın
                kendisi ayarlıyor (ekle/düzenle). */}
            <Stack.Screen
              name="YarnDirectory"
              component={YarnDirectoryScreen}
              options={{ headerShown: true, title: 'İplik Dizini' }}
            />
            <Stack.Screen
              name="YarnForm"
              component={YarnFormScreen}
              options={{ headerShown: true, title: 'İplik Ekle' }}
            />
            <Stack.Screen
              name="FabricCostCalculator"
              component={FabricCostCalculator}
              options={{ headerShown: true, title: 'Maliyet ve Satış Fiyatı' }}
            />
            <Stack.Screen
              name="GarmentCostCalculator"
              component={GarmentCostCalculator}
              options={{ headerShown: true, title: 'Konfeksiyon Ürün Maliyeti' }}
            />
            <Stack.Screen
              name="YarnCountCalculator"
              component={YarnCountCalculator}
              options={{ headerShown: true, title: 'İplik Numarası' }}
            />
            <Stack.Screen
              name="YarnUsageCalculator"
              component={YarnUsageCalculator}
              options={{ headerShown: true, title: 'İplik Kullanım Miktarı' }}
            />
            <Stack.Screen
              name="YarnRatioCalculator"
              component={YarnRatioCalculator}
              options={{ headerShown: true, title: 'İplik Kullanım Oranı' }}
            />
            <Stack.Screen
              name="FabricWeightCalculator"
              component={FabricWeightCalculator}
              options={{ headerShown: true, title: 'Kumaş Gramajı' }}
            />
            <Stack.Screen
              name="ProductionCalculator"
              component={ProductionCalculator}
              options={{ headerShown: true, title: 'Kumaş Üretimi' }}
            />
            <Stack.Screen
              name="SampleRequestForm"
              component={SampleRequestFormScreen}
              options={{ headerShown: true, title: 'Numune Talebi' }}
            />
            <Stack.Screen
              name="SampleRequestTracking"
              component={SampleRequestTrackingScreen}
              options={{ headerShown: true, title: 'Numune Takibi' }}
            />
            <Stack.Screen
              name="MySampleRequests"
              component={MySampleRequestsScreen}
              options={{ headerShown: true, title: 'Taleplerim' }}
            />
            <Stack.Screen
              name="IncomingSampleRequests"
              component={IncomingSampleRequestsScreen}
              options={{ headerShown: true, title: 'Gelen Talepler' }}
            />
            <Stack.Screen
              name="QuoteRequestForm"
              component={QuoteRequestFormScreen}
              options={{ headerShown: true, title: 'Teklif İste' }}
            />
            <Stack.Screen
              name="QuoteRequestDetail"
              component={QuoteRequestDetailScreen}
              options={{ headerShown: true, title: 'Teklif' }}
            />
            <Stack.Screen
              name="QuoteRequests"
              component={QuoteRequestsScreen}
              options={{ headerShown: true, title: 'Tekliflerim' }}
            />
            {/* Faz 3, Adım 4: kabul edilen teklifin sipariş kaydı. */}
            <Stack.Screen
              name="DealDetail"
              component={DealDetailScreen}
              options={{ headerShown: true, title: 'Sipariş' }}
            />
            <Stack.Screen
              name="Deals"
              component={DealsScreen}
              options={{ headerShown: true, title: 'Siparişlerim' }}
            />
            <Stack.Screen
              name="RfqForm"
              component={RfqFormScreen}
              options={{ headerShown: true, title: 'Çoklu Teklif İste' }}
            />
            <Stack.Screen
              name="RfqCompare"
              component={RfqCompareScreen}
              options={{ headerShown: true, title: 'Teklif Karşılaştırma' }}
            />
            <Stack.Screen
              name="GarmentVisualCost"
              component={GarmentVisualCostScreen}
              options={{ headerShown: true, title: 'Görsel Maliyet Tablosu' }}
            />
            <Stack.Screen
              name="Admin"
              component={AdminScreen}
              options={{ headerShown: true, title: 'Firma Doğrulama (Admin)' }}
            />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: true, title: 'Profil' }} />
            <Stack.Screen
              name="Connections"
              component={ConnectionsListScreen}
              options={{ headerShown: true, title: 'Bağlantılarım' }}
            />
            <Stack.Screen
              name="ConnectionRequests"
              component={ConnectionRequestsScreen}
              options={{ headerShown: true, title: 'Bağlantı İstekleri' }}
            />
            {/* Faz 2, Adım 4: tedarikçi/müşteri daveti. */}
            <Stack.Screen name="Invites" component={InvitesScreen} options={{ headerShown: true, title: 'Davet Et' }} />
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={({ route }) => ({
                headerShown: true,
                title: route.params.title,
                // Başlıkta karşı tarafın fotoğrafı + adı (LinkedIn/WhatsApp
                // deseni); userId gelmediyse varsayılan başlık kalır.
                headerTitle: route.params.userId
                  ? () => <ChatHeaderTitle title={route.params.title} userId={route.params.userId!} avatarUpdatedAt={route.params.avatarUpdatedAt} />
                  : undefined,
              })}
            />
            <Stack.Screen
              name="NewConversation"
              component={NewConversationScreen}
              options={{ headerShown: true, title: 'Yeni Mesaj' }}
            />
            <Stack.Screen
              name="CreatePost"
              component={CreatePostScreen}
              options={{ headerShown: true, title: 'Gönderi Paylaş' }}
            />
            <Stack.Screen
              name="SelectProduct"
              component={SelectProductScreen}
              options={{ headerShown: true, title: 'Ürün Seç' }}
            />
            <Stack.Screen
              name="PostComments"
              component={PostCommentsScreen}
              options={{ headerShown: true, title: 'Yorumlar' }}
            />
          </Stack.Group>
        ) : (
          <Stack.Group>
            <Stack.Screen name="RoleSelection" component={RoleSelectionScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Position" component={PositionScreen} />
            <Stack.Screen name="PersonalInfo" component={PersonalInfoScreen} />
            <Stack.Screen name="CompanyInfo" component={CompanyInfoScreen} />
            <Stack.Screen name="PhoneVerification" component={PhoneVerificationScreen} />
            <Stack.Screen name="CompanyCode" component={CompanyCodeScreen} />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
