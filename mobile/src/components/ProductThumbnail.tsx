import React, { useEffect, useState } from 'react';
import { View, Image } from 'react-native';
import { getCachedProductImage, loadProductImage } from '../features/products/productImageCache';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../ui';

interface Props {
  productId: string;
  hasImage: boolean;
  size?: number;
}

// Ürün görseli (DESIGN.md §3 ürün kartı): `thumb` 72px, radius-sm, 1px line;
// görsel yoksa surface-2 kare + kumaş ikonu. Fotoğraf liste yanıtında
// gelmiyor; kart göründüğünde buradan tek tek çekilip önbelleğe alınıyor.
export function ProductThumbnail({ productId, hasImage, size }: Props) {
  const t = useTheme();
  const d = size ?? t.size.thumb;
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

  return (
    <View
      style={{
        width: d,
        height: d,
        borderRadius: t.radius.sm,
        borderWidth: 1,
        borderColor: t.colors.line,
        backgroundColor: t.colors.surface2,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
      ) : (
        <Icon name="fabric" color="ink3" />
      )}
    </View>
  );
}
