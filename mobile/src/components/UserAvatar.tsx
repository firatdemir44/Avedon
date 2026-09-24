import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../ui';
import { getCachedUserAvatar, loadUserAvatar, userAvatarKey } from '../features/users/userAvatarCache';
import { tr } from '../i18n';

interface Props {
  userId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  // Doluysa kişinin fotoğrafı çekilir; boşsa baş harfler kalır.
  avatarUpdatedAt?: string | null;
  size?: number;
  // Lacivert bandın (üst çubuk) üstünde beyaz zemin + lacivert harf gerekiyor.
  variant?: 'default' | 'onPrimary';
}

// KİŞİ avatarı — firma logosu (CompanyAvatar) ile aynı çalışır ama yuvarlaktır
// ve kaynağı kişinin kendi fotoğrafıdır. Fotoğraf yüklenene kadar ve fotoğraf
// yoksa baş harfler görünür; istek başarısız olursa sessizce baş harfe düşer.
//
// Yeni tasarım (4. adım): renkler `useTheme()` token'larından geliyor, ham hex yok.
// Varsayılan zemin DESIGN.md §3 liste satırı kuralındaki `brandSoft`/`brand` çifti.
export function UserAvatar({ userId, firstName, lastName, avatarUpdatedAt, size, variant = 'default' }: Props) {
  const t = useTheme();
  const box = size ?? t.size.avatar;
  const key = userId && avatarUpdatedAt ? userAvatarKey(userId, avatarUpdatedAt) : null;
  const [photo, setPhoto] = useState<string | null>(() => (key ? getCachedUserAvatar(key) ?? null : null));

  useEffect(() => {
    if (!key) {
      setPhoto(null);
      return;
    }
    const cached = getCachedUserAvatar(key);
    if (cached) {
      setPhoto(cached);
      return;
    }
    let cancelled = false;
    setPhoto(null);
    loadUserAvatar(key)
      .then((url) => {
        if (!cancelled) setPhoto(url);
      })
      .catch(() => {
        // Fotoğraf gelmezse baş harf kalır.
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const initials = `${firstName?.trim()?.charAt(0) ?? ''}${lastName?.trim()?.charAt(0) ?? ''}`.toLocaleUpperCase(
    'tr-TR'
  );
  const name = [firstName, lastName].filter(Boolean).join(' ');
  const onPrimary = variant === 'onPrimary';

  if (photo) {
    return (
      <Image
        source={{ uri: photo }}
        style={[
          styles.box,
          {
            width: box,
            height: box,
            borderRadius: box / 2,
            backgroundColor: t.colors.surface1,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: t.colors.line,
          },
        ]}
        resizeMode="cover"
        accessibilityLabel={name ? tr('{name} profil fotoğrafı', { name }) : tr('Profil fotoğrafı')}
      />
    );
  }

  return (
    <View
      style={[
        styles.box,
        {
          width: box,
          height: box,
          borderRadius: box / 2,
          backgroundColor: onPrimary ? t.colors.surface1 : t.colors.brandSoft,
        },
      ]}
    >
      {initials ? (
        <Text
          style={[
            t.type.body16Strong,
            { color: t.colors.brand, fontSize: Math.round(box * 0.4), lineHeight: Math.round(box * 0.5) },
          ]}
        >
          {initials}
        </Text>
      ) : (
        <Icon name="user" size={Math.round(box * 0.55)} color="brand" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
