import React, { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from './types';
import { useSession } from '../context/SessionContext';
import { fetchToday } from '../api/client';
import { FeedScreen } from '../screens/feed/FeedScreen';
import { ProductListScreen } from '../screens/products/ProductListScreen';
import { AssistantScreen } from '../screens/assistant/AssistantScreen';
import { ConversationsListScreen } from '../screens/messages/ConversationsListScreen';
import { CompaniesDirectoryScreen } from '../screens/companies/CompaniesDirectoryScreen';
import { TabBarFromNavigation, TakyonMark } from '../ui';
import { useTheme } from '../theme/ThemeContext';

const Tab = createBottomTabNavigator<MainTabParamList>();

const BADGE_POLL_MS = 20000;

// Alt çubukta TAM 5 sekme (DESIGN.md §2, 2026-09-24):
// Ana sayfa · Katalog · Asistan · Mesajlar · Firmalar. Asistan ortada, simgesi
// büyük Takyon işareti. Talepler sekmeden çıkıp kök yığında geri oklu ekran oldu
// (ana sayfadaki "Talepler" kısayolu; bekleyen talep noktası orada).
// Rota adı "AssistantTab" korunur: pek çok ekran navigate('AssistantTab') çağırıyor.
export function MainTabs() {
  const t = useTheme();
  const { user } = useSession();
  const [unreadMessages, setUnreadMessages] = useState(0);

  const refreshBadges = useCallback(() => {
    if (!user) return;
    if (AppState.currentState !== 'active') return;
    fetchToday()
      .then((today) => setUnreadMessages(today.unreadMessages))
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
          icons={{ CompaniesDirectory: 'business-outline' }}
          iconNodes={{ AssistantTab: <TakyonMark size={t.size.tabIconLg} /> }}
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
      <Tab.Screen name="AssistantTab" component={AssistantScreen} options={{ title: 'Asistan' }} />
      <Tab.Screen
        name="Conversations"
        component={ConversationsListScreen}
        listeners={{ focus: refreshBadges }}
        options={{
          title: 'Mesajlar',
          // `tabBarBadge` yalnızca bildirim NOKTASINI açar (src/ui TabBar).
          tabBarBadge: unreadMessages > 0 ? unreadMessages : undefined,
        }}
      />
      <Tab.Screen name="CompaniesDirectory" component={CompaniesDirectoryScreen} options={{ title: 'Firmalar' }} />
    </Tab.Navigator>
  );
}
