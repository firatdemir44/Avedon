import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import { MainTabs } from './MainTabs';
import { useSession } from '../context/SessionContext';
import { colors } from '../theme';
import { RoleSelectionScreen } from '../screens/onboarding/RoleSelectionScreen';
import { PositionScreen } from '../screens/onboarding/PositionScreen';
import { PersonalInfoScreen } from '../screens/onboarding/PersonalInfoScreen';
import { CompanyInfoScreen } from '../screens/onboarding/CompanyInfoScreen';
import { PhoneVerificationScreen } from '../screens/onboarding/PhoneVerificationScreen';
import { CompanyCodeScreen } from '../screens/onboarding/CompanyCodeScreen';
import { CompanyProfileScreen } from '../screens/company/CompanyProfileScreen';
import { AddProductScreen } from '../screens/company/AddProductScreen';
import { AdvisorScreen } from '../screens/advisor/AdvisorScreen';
import { FabricCostCalculator } from '../screens/calculators/FabricCostCalculator';
import { GarmentCostCalculator } from '../screens/calculators/GarmentCostCalculator';
import { YarnCountCalculator } from '../screens/calculators/YarnCountCalculator';
import { YarnUsageCalculator } from '../screens/calculators/YarnUsageCalculator';
import { FabricWeightCalculator } from '../screens/calculators/FabricWeightCalculator';
import { ProductionCalculator } from '../screens/calculators/ProductionCalculator';
import { SampleRequestFormScreen } from '../screens/samples/SampleRequestFormScreen';
import { MySampleRequestsScreen } from '../screens/samples/MySampleRequestsScreen';
import { IncomingSampleRequestsScreen } from '../screens/samples/IncomingSampleRequestsScreen';
import { GarmentVisualCostScreen } from '../screens/visualCosting/GarmentVisualCostScreen';
import { LoginScreen } from '../screens/onboarding/LoginScreen';
import { AdminScreen } from '../screens/admin/AdminScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { ConnectionsListScreen } from '../screens/connections/ConnectionsListScreen';
import { ConnectionRequestsScreen } from '../screens/connections/ConnectionRequestsScreen';
import { ChatScreen } from '../screens/messages/ChatScreen';
import { NewConversationScreen } from '../screens/messages/NewConversationScreen';
import { CreatePostScreen } from '../screens/feed/CreatePostScreen';
import { PostCommentsScreen } from '../screens/feed/PostCommentsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Varsayılan tema iOS mavisi kullanıyor; sekme çubuğu ve başlıklar uygulamanın
// kendi paletiyle uyumlu olsun diye eziyoruz.
const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
  },
};

export function RootNavigator() {
  const { user, isRestoring } = useSession();

  if (isRestoring) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      {/* Giriş durumuna göre iki ayrı ağaç render ediliyor: giriş/çıkış sonrası
          ayrıca gezinme çağrısı gerekmiyor ve kayıt biten kullanıcı geri tuşuyla
          kayıt adımlarına dönemiyor. */}
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Group>
            <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen
              name="CompanyProfile"
              component={CompanyProfileScreen}
              options={{ headerShown: true, title: 'Firmam' }}
            />
            <Stack.Screen
              name="AddProduct"
              component={AddProductScreen}
              options={{ headerShown: true, title: 'Ürün Ekle' }}
            />
            <Stack.Screen
              name="Advisor"
              component={AdvisorScreen}
              options={{ headerShown: true, title: 'AI Tekstil Danışmanı' }}
            />
            <Stack.Screen
              name="FabricCostCalculator"
              component={FabricCostCalculator}
              options={{ headerShown: true, title: 'Kumaş Maliyeti' }}
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
              name="FabricWeightCalculator"
              component={FabricWeightCalculator}
              options={{ headerShown: true, title: 'Kumaş Gramajı' }}
            />
            <Stack.Screen
              name="ProductionCalculator"
              component={ProductionCalculator}
              options={{ headerShown: true, title: 'Üretim Hesaplama' }}
            />
            <Stack.Screen
              name="SampleRequestForm"
              component={SampleRequestFormScreen}
              options={{ headerShown: true, title: 'Numune Talebi' }}
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
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={({ route }) => ({ headerShown: true, title: route.params.title })}
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
