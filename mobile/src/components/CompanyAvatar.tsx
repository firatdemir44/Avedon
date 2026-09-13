import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';
import type { VerificationStatus } from '../types';

interface Props {
  name?: string | null;
  verification?: VerificationStatus | null;
  size?: number;
}

// Company modelinde henüz logo alanı yok (ve yükleme altyapısı da yok), bu yüzden
// firma adının baş harfiyle bir yer tutucu gösteriyoruz. Logo eklendiğinde bu
// bileşenin içi değişir, düzen aynı kalır.
export function CompanyAvatar({ name, verification, size = 36 }: Props) {
  const initial = name?.trim()?.charAt(0)?.toLocaleUpperCase('tr-TR') ?? '?';

  return (
    <View style={styles.wrapper}>
      <View style={[styles.box, { width: size, height: size }]}>
        <Text style={[styles.initial, { fontSize: size * 0.45 }]}>{initial}</Text>
      </View>
      {verification === 'dogrulanmis' ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>✓</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
  box: {
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: colors.primaryText,
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.primary,
  },
});
