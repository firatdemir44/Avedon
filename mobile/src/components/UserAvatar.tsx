import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../theme';
import { getCachedUserAvatar, loadUserAvatar, userAvatarKey } from '../features/users/userAvatarCache';

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
export function UserAvatar({ userId, firstName, lastName, avatarUpdatedAt, size = 36, variant = 'default' }: Props) {
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
        style={[styles.box, styles.photo, { width: size, height: size, borderRadius: size / 2 }]}
        resizeMode="cover"
        accessibilityLabel={name ? `${name} profil fotoğrafı` : 'Profil fotoğrafı'}
      />
    );
  }

  return (
    <View
      style={[
        styles.box,
        onPrimary ? styles.boxOnPrimary : styles.boxDefault,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      {initials ? (
        <Text
          style={[
            styles.initials,
            onPrimary ? styles.initialsOnPrimary : styles.initialsDefault,
            { fontSize: Math.round(size * 0.4) },
          ]}
        >
          {initials}
        </Text>
      ) : (
        <Ionicons
          name="person"
          size={Math.round(size * 0.55)}
          color={onPrimary ? colors.primary : colors.primaryText}
        />
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
  boxDefault: { backgroundColor: colors.primary },
  boxOnPrimary: { backgroundColor: colors.surface },
  // Şeffaf/açık fotoğraflar zeminde kaybolmasın diye ince çerçeve.
  photo: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  initials: { fontFamily: fonts.bold },
  initialsDefault: { color: colors.primaryText },
  initialsOnPrimary: { color: colors.primary },
});
