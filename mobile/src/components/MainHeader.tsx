import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useSession } from '../context/SessionContext';
import { NotificationBell } from './NotificationBell';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../theme';

// Dört ana sekmenin (Akış, Ürünler, Asistan, Mesajlar) ortak üst başlığı
// (Fırat 2026-09-21, referans LinkedIn üst çubuğu): solda yuvarlak profil
// düğmesi, ortada "Arama Yap" kutusu görünümünde düğme, sağda bildirim zili.
// Lacivert bant korunur; React Navigation'ın kendi başlığı yerine `header`
// seçeneğiyle çiziliyor ki ortadaki kutu tüm boş genişliği alsın (headerTitle
// kabı sağ/sol eylemlere göre daraltılıyor ve web'de de taşıyordu).
//
// Güvenli alan: özel başlık kendi üst boşluğunu `useSafeAreaInsets` ile ekler.
export function MainHeader({ right }: { right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useSession();

  const initials = user
    ? `${user.firstName?.charAt(0) ?? ''}${user.lastName?.charAt(0) ?? ''}`.toLocaleUpperCase('tr-TR')
    : '';

  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        {/* Kişi profili: firma logosu DEĞİL, kullanıcının baş harfleri
            (kullanıcı fotoğrafı alanı henüz yok). */}
        <Pressable
          onPress={() => navigation.navigate('MyProfile')}
          accessibilityRole="button"
          accessibilityLabel="Profilim"
          hitSlop={6}
          style={({ pressed }) => [styles.avatarWrap, pressed && styles.pressed]}
        >
          <View style={styles.avatar}>
            {initials ? (
              <Text style={styles.avatarText}>{initials}</Text>
            ) : (
              <Ionicons name="person" size={20} color={colors.primary} />
            )}
          </View>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('GlobalSearch')}
          accessibilityRole="search"
          accessibilityLabel="Arama yap"
          style={({ pressed }) => [styles.searchBox, pressed && styles.searchPressed]}
        >
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <Text style={styles.searchText} numberOfLines={1}>
            Arama Yap
          </Text>
        </Pressable>

        <View style={styles.actions}>
          <NotificationBell />
          {right}
        </View>
      </View>
    </View>
  );
}

const AVATAR = 38;

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.primary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    minHeight: 52,
    paddingVertical: 6,
  },
  avatarWrap: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  pressed: { backgroundColor: 'rgba(255,255,255,0.14)' },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.primary },
  // Lacivert bant üzerinde okunaklı olsun diye beyaza yakın zemin; köşeler
  // tam yuvarlak (bu kutu "hap biçimli düğme yok" kuralının istisnası,
  // referans görseldeki arama kutusu).
  searchBox: {
    flex: 1,
    minWidth: 90,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  searchPressed: { backgroundColor: colors.pressed },
  searchText: { ...typography.body, color: colors.textMuted, flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center' },
});
