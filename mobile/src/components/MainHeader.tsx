import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useSession } from '../context/SessionContext';
import { NotificationBell } from './NotificationBell';
import { UserAvatar } from './UserAvatar';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../ui';
import { tr } from '../i18n';

// Dört ana sekmenin ortak üst başlığı: solda yuvarlak profil düğmesi, ortada
// arama kutusu görünümünde düğme, sağda bildirim zili. AppBar ile aynı bant
// (surfaceBrand, 56px, güvenli alan), ama başlık yerine arama kutusu var.
//
// Yeni tasarım (4. adım): tüm renk/ölçü `useTheme()` token'larından.
export function MainHeader({ right }: { right?: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useSession();

  return (
    <View style={{ paddingTop: insets.top, backgroundColor: t.colors.surfaceBrand }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[2],
          paddingHorizontal: t.space[2],
          minHeight: t.size.appbar,
          minWidth: 0,
        }}
      >
        {/* Kişi profili: firma logosu DEĞİL, kullanıcının kendi fotoğrafı. */}
        <Pressable
          onPress={() => navigation.navigate('MyProfile')}
          accessibilityRole="button"
          accessibilityLabel={tr('Profilim')}
          style={({ pressed }) => ({
            width: t.size.touchMin,
            height: t.size.touchMin,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: t.radius.full,
            backgroundColor: pressed ? t.colors.brandStrong : 'transparent',
          })}
        >
          <UserAvatar
            userId={user?.id}
            firstName={user?.firstName}
            lastName={user?.lastName}
            avatarUpdatedAt={user?.avatarUpdatedAt}
            size={t.size.avatar}
            variant="onPrimary"
          />
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('GlobalSearch')}
          accessibilityRole="search"
          accessibilityLabel={tr('Arama yap')}
          style={({ pressed }) => ({
            flex: 1,
            minWidth: 0,
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.space[2],
            height: t.size.avatar,
            paddingHorizontal: t.space[3],
            borderRadius: t.radius.md,
            backgroundColor: pressed ? t.colors.surface2 : t.colors.surface1,
            borderWidth: 1,
            borderColor: t.colors.lineStrong,
          })}
        >
          <Icon name="search" size={t.size.iconSm} color="ink3" />
          <Text style={[t.type.body16, { color: t.colors.ink3, flexShrink: 1 }]} numberOfLines={1}>
            Arama Yap
          </Text>
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <NotificationBell />
          {right}
        </View>
      </View>
    </View>
  );
}
