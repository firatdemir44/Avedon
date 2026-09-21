import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { HeaderButton } from './HeaderButton';
import { useSession } from '../context/SessionContext';
import { useUnreadNotifications } from '../features/notifications/unreadCount';

// Sayaçlı bildirim zili (Faz 2, Adım 1). Akış, Ürünler, Mesajlar ve Profil
// sekmelerinin başlığında aynı bileşen duruyor; sayı modül düzeyinde
// paylaşıldığı için her sekme ayrı ayrı sunucuyu yoklamıyor
// (features/notifications/unreadCount.ts). Oturumsuz kullanıcıda çizilmez.
export function NotificationBell() {
  const { user } = useSession();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const unread = useUnreadNotifications(!!user);

  if (!user) return null;
  return (
    <HeaderButton
      icon="notifications-outline"
      label="Bildirimler"
      badge={unread}
      onPress={() => navigation.navigate('Notifications')}
    />
  );
}
