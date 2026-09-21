import React, { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import type { MainTabParamList } from './types';
import { useSession } from '../context/SessionContext';
import { fetchUnreadMessageCount } from '../api/client';
import { FeedScreen } from '../screens/feed/FeedScreen';
import { ProductListScreen } from '../screens/products/ProductListScreen';
import { AssistantScreen } from '../screens/assistant/AssistantScreen';
import { ConversationsListScreen } from '../screens/messages/ConversationsListScreen';
import { MainHeader } from '../components/MainHeader';
import { colors, fonts, typography } from '../theme';

const Tab = createBottomTabNavigator<MainTabParamList>();

const UNREAD_POLL_MS = 20000;

export function MainTabs() {
  const { user } = useSession();
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(() => {
    if (!user) return;
    if (AppState.currentState !== 'active') return;
    fetchUnreadMessageCount()
      .then(({ count }) => setUnread(count))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    refreshUnread();
    const timer = setInterval(refreshUnread, UNREAD_POLL_MS);
    return () => clearInterval(timer);
  }, [refreshUnread]);

  return (
    <Tab.Navigator
      initialRouteName="Feed"
      backBehavior="firstRoute"
      screenOptions={{
        headerShown: true,
        // Ortak üst başlık (2026-09-21): profil · "Arama Yap" · zil. Ekranlar
        // `headerRight` ile kendi ek eylemlerini verir (Mesajlar'daki "Yeni",
        // Asistan'daki hafıza/sohbetler); zil bileşenin kendi içinde.
        header: ({ options, navigation: tabNavigation }) => (
          <MainHeader
            right={options.headerRight?.({ tintColor: colors.primaryText, canGoBack: tabNavigation.canGoBack() })}
          />
        ),
        freezeOnBlur: true,
        // Android'de klavye açılınca sekme çubuğu arama kutusunun üstüne binmesin.
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 12, fontFamily: fonts.medium },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarBadgeStyle: { backgroundColor: colors.notification, fontFamily: fonts.semibold, fontSize: 12 },
        // C · Pazar Masası: lacivert üst bant, beyaz başlık (bkz. theme/index.ts).
        headerTitleStyle: { ...typography.heading, color: colors.primaryText },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.primaryText,
      }}
    >
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={{
          title: 'Akış',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="ProductList"
        component={ProductListScreen}
        options={{
          title: 'Ürünler',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="AssistantTab"
        component={AssistantScreen}
        options={{
          title: 'Asistan',
          // Asistan kızılı YALNIZCA seçili asistan ikonunda; diğer sekmeler
          // lacivert kalır (bkz. theme/index.ts colors.assistant kuralı).
          tabBarActiveTintColor: colors.assistant,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'sparkles' : 'sparkles-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Conversations"
        component={ConversationsListScreen}
        // Sohbetten geri dönünce de rozet tazelensin.
        listeners={{ focus: refreshUnread }}
        options={{
          title: 'Mesajlar',
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
