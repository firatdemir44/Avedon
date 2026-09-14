import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import type { VerificationStatus } from '../types';
import { companyLogoKey, getCachedCompanyLogo, loadCompanyLogo } from '../features/companies/companyLogoCache';

interface Props {
  name?: string | null;
  verification?: VerificationStatus | null;
  size?: number;
  // İkisi birlikte verilirse firmanın yüklediği logo gösterilir; yoksa (ya da
  // logo gelene kadar) firma adının baş harfi.
  companyId?: string | null;
  logoUpdatedAt?: string | null;
}

export function CompanyAvatar({ name, verification, size = 36, companyId, logoUpdatedAt }: Props) {
  const key = companyId && logoUpdatedAt ? companyLogoKey(companyId, logoUpdatedAt) : null;
  const [logo, setLogo] = useState<string | null>(() => (key ? getCachedCompanyLogo(key) ?? null : null));

  useEffect(() => {
    if (!key) {
      setLogo(null);
      return;
    }
    const cached = getCachedCompanyLogo(key);
    if (cached) {
      setLogo(cached);
      return;
    }
    let cancelled = false;
    loadCompanyLogo(key)
      .then((url) => {
        if (!cancelled) setLogo(url);
      })
      .catch(() => {
        // Logo gelmezse baş harf kalır.
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const initial = name?.trim()?.charAt(0)?.toLocaleUpperCase('tr-TR') ?? '?';

  return (
    <View style={styles.wrapper}>
      {logo ? (
        <Image
          source={{ uri: logo }}
          style={[styles.box, styles.logoBox, { width: size, height: size }]}
          resizeMode="cover"
          accessibilityLabel={name ? `${name} logosu` : 'Firma logosu'}
        />
      ) : (
        <View style={[styles.box, { width: size, height: size }]}>
          <Text style={[styles.initial, { fontSize: size * 0.45 }]}>{initial}</Text>
        </View>
      )}
      {verification === 'dogrulanmis' ? (
        <View style={styles.badge} accessibilityLabel="Doğrulanmış firma">
          <Ionicons name="checkmark" size={10} color={colors.primary} />
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
    overflow: 'hidden',
  },
  // Şeffaf zeminli logolar lacivertin üstünde kaybolmasın.
  logoBox: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
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
});
