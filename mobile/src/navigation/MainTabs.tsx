import React, { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import type { MainTabParamList } from './types';
import { useSession } from '../context/SessionContext';
import { fetchUnreadMessageCount } from '../api/client';
import { FeedScreen } from '../screens/feed/FeedScreen';
import { ProductListScreen } from '../screens/products/ProductListScreen';
import { CalculatorsListScreen } from '../screens/calculators/CalculatorsListScreen';
import { ConversationsListScreen } from '../screens/messages/ConversationsListScreen';
import { MyProfileScreen } from '../screens/profile/MyProfileScreen';
import { colors } from '../theme';

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
        freezeOnBlur: true,
        // Android'de klavye açılınca sekme çubuğu arama kutusunun üstüne binmesin.
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
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
        name="CalculatorsList"
        component={CalculatorsListScreen}
        options={{
          title: 'Hesaplamalar',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'calculator' : 'calculator-outline'} color={color} size={size} />
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
      <Tab.Screen
        name="MyProfile"
        component={MyProfileScreen}
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
