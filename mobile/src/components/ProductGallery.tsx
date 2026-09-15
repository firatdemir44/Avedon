import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCachedGalleryImage, loadGalleryImage } from '../features/products/productImageCache';
import { colors, fonts, radius, spacing, typography } from '../theme';

interface Props {
  productId: string;
  imageCount: number;
  height?: number;
  onOpenImage?: (imageUrl: string) => void;
  // Fotoğrafın üstünde duran öğe (ör. favori düğmesi).
  overlay?: React.ReactNode;
}

// Ürün sayfasının kaydırmalı fotoğraf galerisi (orijinal tasarım "Ürün Sayfası").
// Fotoğraflar liste yanıtında gelmiyor; yalnızca görünen ve komşu sayfalar
// çekiliyor, böylece 6 fotoğraflı üründe açılışta 6 istek gitmiyor.
export function ProductGallery({ productId, imageCount, height = 260, onOpenImage, overlay }: Props) {
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

  if (imageCount === 0) {
    return (
      <View style={[styles.frame, styles.placeholder, { height }]}>
        <Ionicons name="image-outline" size={28} color={colors.chevron} />
        <Text style={styles.placeholderText}>Bu ürünün fotoğrafı yok</Text>
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
    <View style={[styles.frame, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
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
                style={({ pressed }) => [{ width, height }, pressed && styles.pressed]}
              >
                {url ? (
                  <Image source={{ uri: url }} style={{ width, height }} resizeMode="cover" />
                ) : (
                  <View style={[styles.placeholder, { width, height }]}>
                    <ActivityIndicator color={colors.chevron} />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {imageCount > 1 ? (
        <>
          <View style={styles.counter} pointerEvents="none">
            <Text style={styles.counterText}>
              {index + 1}/{imageCount}
            </Text>
          </View>
          <View style={styles.dots} pointerEvents="none">
            {Array.from({ length: imageCount }, (_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
        </>
      ) : null}
      {overlay}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceTonal },
  placeholder: { alignItems: 'center', justifyContent: 'center', gap: spacing.xs, backgroundColor: colors.surfaceTonal },
  placeholderText: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  pressed: { opacity: 0.9 },
  counter: {
    position: 'absolute',
    left: spacing.sm,
    top: spacing.sm,
    backgroundColor: 'rgba(17,26,34,0.6)',
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  counterText: { ...typography.mono, fontSize: 13, lineHeight: 17, color: colors.primaryText },
  dots: {
    position: 'absolute',
    bottom: spacing.sm,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.6)' },
  dotActive: { backgroundColor: colors.primaryText, width: 16 },
});
