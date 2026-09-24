import React, { useEffect, useState } from 'react';
import { tr } from '../i18n';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../ui';
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

// FİRMA avatarı: kare (radius.sm), zemin `brandSoft`, harf `brand` (DESIGN.md §3).
export function CompanyAvatar({ name, verification, size, companyId, logoUpdatedAt }: Props) {
  const t = useTheme();
  const box = size ?? t.size.avatar;
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
  const badgeSize = t.size.iconXs + 2;

  return (
    <View style={styles.wrapper}>
      {logo ? (
        <Image
          source={{ uri: logo }}
          style={[
            styles.box,
            {
              width: box,
              height: box,
              borderRadius: t.radius.sm,
              backgroundColor: t.colors.surface1,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: t.colors.line,
            },
          ]}
          // Logo kareye sığar; kenarları kırpılmaz (yatay logolar taşıyordu).
          resizeMode="contain"
          accessibilityLabel={name ? tr('{name} logosu', { name }) : tr('Firma logosu')}
        />
      ) : (
        <View
          style={[
            styles.box,
            { width: box, height: box, borderRadius: t.radius.sm, backgroundColor: t.colors.brandSoft },
          ]}
        >
          <Text
            style={[
              t.type.body16Strong,
              { color: t.colors.brand, fontSize: Math.round(box * 0.45), lineHeight: Math.round(box * 0.56) },
            ]}
          >
            {initial}
          </Text>
        </View>
      )}
      {verification === 'dogrulanmis' ? (
        <View
          style={[
            styles.badge,
            {
              right: -t.space[1],
              bottom: -t.space[1],
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              backgroundColor: t.colors.successSoft,
              borderWidth: 1,
              borderColor: t.colors.success,
            },
          ]}
          accessibilityLabel={tr('Doğrulanmış firma')}
        >
          <Icon name="check" size={t.space[3] - 2} color="success" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
