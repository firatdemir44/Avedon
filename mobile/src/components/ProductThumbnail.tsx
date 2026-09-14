import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { getCachedProductImage, loadProductImage } from '../features/products/productImageCache';
import { colors, fonts, radius } from '../theme';

interface Props {
  productId: string;
  hasImage: boolean;
  size?: number;
}

// Fotoğraf liste yanıtında gelmiyor; kart göründüğünde buradan tek tek çekilip
// önbelleğe alınıyor (bkz. features/imageCache.ts).
export function ProductThumbnail({ productId, hasImage, size = 76 }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(
    () => getCachedProductImage(productId) ?? null
  );

  useEffect(() => {
    if (!hasImage) return;
    const cached = getCachedProductImage(productId);
    if (cached) {
      setImageUrl(cached);
      return;
    }
    let cancelled = false;
    loadProductImage(productId)
      .then((url) => {
        if (!cancelled) setImageUrl(url);
      })
      .catch(() => {
        // Fotoğraf çekilemezse yer tutucu kalsın; kartın geri kalanı çalışıyor.
      });
    return () => {
      cancelled = true;
    };
  }, [productId, hasImage]);

  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} style={[styles.image, { width: size, height: size }]} />;
  }

  return (
    <View style={[styles.placeholder, { width: size, height: size }]}>
      <Text style={styles.placeholderText}>{hasImage ? '...' : 'Görsel yok'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTonal,
  },
  placeholder: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTonal,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  placeholderText: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
