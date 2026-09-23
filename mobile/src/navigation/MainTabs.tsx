import React, { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from './types';
import { useSession } from '../context/SessionContext';
import { fetchToday } from '../api/client';
import { FeedScreen } from '../screens/feed/FeedScreen';
import { ProductListScreen } from '../screens/products/ProductListScreen';
import { AssistantScreen } from '../screens/assistant/AssistantScreen';
import { RequestsScreen } from '../screens/requests/RequestsScreen';
import { ConversationsListScreen } from '../screens/messages/ConversationsListScreen';
import { CompaniesDirectoryScreen } from '../screens/companies/CompaniesDirectoryScreen';
import { MainHeader } from '../components/MainHeader';
import { TabBarFromNavigation } from '../ui';
import { colors } from '../theme';

const Tab = createBottomTabNavigator<MainTabParamList>();

const BADGE_POLL_MS = 20000;

// Yeni tasarım, 3. adım (DESIGN.md §2): çubukta TAM 5 sekme —
// Ana sayfa · Katalog · Talepler · Mesajlar · Firmalar (2026-09-23; Hesap araçları
// sekmeden çıkıp kök yığında geri oklu ekran oldu). Çubuğu artık
// `src/ui`deki TabBar çiziyor (64px, surface-1, ikon + etiket, accent nokta).
//
// AssistantTab: sekmeden ÇIKTI ama rota olarak DURUYOR. Pek çok ekran
// `navigation.navigate('AssistantTab')` çağırıyor (hesap araçları, ana sayfa
// kısayolu, ürün ekranları); rotayı kök yığına taşımak bu çağrıların hepsini
// kırardı. Bu yüzden en az kırılgan yol seçildi: rota sekme navigatöründe
// kalır, çubukta `hiddenRoutes` ile gizlenir.
export function MainTabs() {
  const { user } = useSession();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [openRequests, setOpenRequests] = useState(0);

  const refreshBadges = useCallback(() => {
    if (!user) return;
    if (AppState.currentState !== 'active') return;
    // Tek istek: mesaj ve talep rozetlerinin ikisini de "Bugün" ucu veriyor.
    fetchToday()
      .then((today) => {
        setUnreadMessages(today.unreadMessages);
        setOpenRequests(today.pendingSamples + today.newQuotes);
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    refreshBadges();
    const timer = setInterval(refreshBadges, BADGE_POLL_MS);
    return () => clearInterval(timer);
  }, [refreshBadges]);

  return (
    <Tab.Navigator
      initialRouteName="Feed"
      backBehavior="firstRoute"
      tabBar={(props) => (
        <TabBarFromNavigation
          {...props}
          hiddenRoutes={['AssistantTab']}
          // Talepler sekmesinin ikonu numune kutusu (artboard 1 ve 7).
          icons={{ Requests: 'sample', CompaniesDirectory: 'business-outline' }}
        />
      )}
      screenOptions={{
        // Her ekran kendi `AppBar`ını (src/ui) çiziyor; navigatörün başlığı kapalı.
        headerShown: false,
        freezeOnBlur: true,
      }}
    >
      <Tab.Screen name="Feed" component={FeedScreen} options={{ title: 'Ana sayfa' }} />
      <Tab.Screen name="ProductList" component={ProductListScreen} options={{ title: 'Katalog' }} />
      <Tab.Screen
        name="Requests"
        component={RequestsScreen}
        listeners={{ focus: refreshBadges }}
        options={{
          title: 'Talepler',
          // `tabBarBadge` yalnızca bildirim NOKTASINI açar (src/ui TabBar).
          tabBarBadge: openRequests > 0 ? openRequests : undefined,
        }}
      />
      <Tab.Screen
        name="Conversations"
        component={ConversationsListScreen}
        listeners={{ focus: refreshBadges }}
        options={{
          title: 'Mesajlar',
          tabBarBadge: unreadMessages > 0 ? unreadMessages : undefined,
        }}
      />
      <Tab.Screen name="CompaniesDirectory" component={CompaniesDirectoryScreen} options={{ title: 'Firmalar' }} />

      {/* Çubukta görünmez (hiddenRoutes); yalnızca navigate ile açılır.
          Kendi üst başlığı yok, ortak MainHeader'ı kullanmayı sürdürüyor. */}
      <Tab.Screen
        name="AssistantTab"
        component={AssistantScreen}
        options={{
          title: 'Asistan',
          tabBarButton: () => null,
          headerShown: true,
          header: ({ options, navigation: tabNavigation }) => (
            <MainHeader
              right={options.headerRight?.({
                tintColor: colors.primaryText,
                canGoBack: tabNavigation.canGoBack(),
              })}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
