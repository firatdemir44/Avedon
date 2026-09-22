import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { getCachedGalleryImage, loadGalleryImage } from '../features/products/productImageCache';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../ui';

// Ürün sayfası galerisinin varsayılan yüksekliği (DESIGN.md'de adı olmayan
// ekran-içi ölçü; ProductDetailScreen'deki HERO_HEIGHT ile aynı dilde).
const GALLERY_HEIGHT = 260;
// Etkin sayfa noktası daha uzun çizilir.
const DOT_ACTIVE_WIDTH = 16;

interface Props {
  productId: string;
  imageCount: number;
  height?: number;
  onOpenImage?: (imageUrl: string) => void;
  // Fotoğrafın üstünde duran öğe (ör. favori düğmesi).
  overlay?: React.ReactNode;
}

// Ürün sayfasının kaydırmalı fotoğraf galerisi. Fotoğraflar liste yanıtında
// gelmiyor; yalnızca görünen ve komşu sayfalar çekiliyor, böylece 6
// fotoğraflı üründe açılışta 6 istek gitmiyor. Kumaş görseli (DESIGN.md §3):
// koyu temada da kendi renginde, 1px line çerçeve.
export function ProductGallery({ productId, imageCount, height = GALLERY_HEIGHT, onOpenImage, overlay }: Props) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [urls, setUrls] = useState<(string | null)[]>([]);

  useEffect(() => {
    setIndex(0);
    setUrls(Array.from({ length: imageCount }, (_, i) => getCachedGalleryImage(productId, i) ?? null));
  }, [productId, imageCount]);

  useEffect(() => {
    let cancelled = false;
    for (const i of [index - 1, index, index + 1]) {
      if (i < 0 || i >= imageCount || getCachedGalleryImage(productId, i)) {
        const cached = i >= 0 && i < imageCount ? getCachedGalleryImage(productId, i) : undefined;
        if (cached) setUrls((prev) => (prev[i] === cached ? prev : Object.assign([...prev], { [i]: cached })));
        continue;
      }
      loadGalleryImage(productId, i)
        .then((url) => {
          if (!cancelled) setUrls((prev) => Object.assign([...prev], { [i]: url }));
        })
        .catch(() => {
          // Gelmeyen fotoğrafın yerinde yer tutucu kalır.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [productId, imageCount, index]);

  const frame = {
    width: '100%' as const,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.line,
    overflow: 'hidden' as const,
    backgroundColor: t.colors.surface2,
  };
  const placeholder = {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: t.space[2],
    backgroundColor: t.colors.surface2,
  };

  if (imageCount === 0) {
    return (
      <View style={[frame, placeholder, { height }]}>
        <Icon name="image-outline" size={t.size.emptyIcon} color="ink3" />
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>Bu ürünün fotoğrafı yok</Text>
        {overlay}
      </View>
    );
  }

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== index && next >= 0 && next < imageCount) setIndex(next);
  };

  return (
    <View style={[frame, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={32}
          accessibilityLabel={`Ürün fotoğrafları, ${imageCount} fotoğraf`}
        >
          {Array.from({ length: imageCount }, (_, i) => {
            const url = urls[i];
            return (
              <Pressable
                key={i}
                onPress={() => url && onOpenImage?.(url)}
                disabled={!url || !onOpenImage}
                accessibilityRole="imagebutton"
                accessibilityLabel={`Fotoğraf ${i + 1} / ${imageCount}`}
                accessibilityHint="Tam ekran büyütür"
                style={({ pressed }) => [{ width, height }, pressed && { opacity: 0.9 }]}
              >
                {url ? (
                  <Image source={{ uri: url }} style={{ width, height }} resizeMode="cover" />
                ) : (
                  <View style={[placeholder, { width, height }]}>
                    <ActivityIndicator color={t.colors.ink3} />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {imageCount > 1 ? (
        <>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: t.space[2],
              top: t.space[2],
              backgroundColor: t.colors.overlay,
              borderRadius: t.radius.sm,
              paddingHorizontal: t.space[2],
              paddingVertical: t.space[1] / 2,
            }}
          >
            <Text style={[t.type.mono14, { color: t.colors.onBrand }]}>
              {index + 1}/{imageCount}
            </Text>
          </View>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: t.space[2],
              left: 0,
              right: 0,
              flexDirection: 'row',
              justifyContent: 'center',
              gap: t.space[1] + t.space[1] / 2,
            }}
          >
            {Array.from({ length: imageCount }, (_, i) => (
              <View
                key={i}
                style={{
                  width: i === index ? DOT_ACTIVE_WIDTH : t.size.dot,
                  height: t.size.dot,
                  borderRadius: t.radius.full,
                  backgroundColor: t.colors.onBrand,
                  opacity: i === index ? 1 : 0.6,
                }}
              />
            ))}
          </View>
        </>
      ) : null}
      {overlay}
    </View>
  );
}
