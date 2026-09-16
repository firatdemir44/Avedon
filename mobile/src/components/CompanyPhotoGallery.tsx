import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import type { CompanyPhotoKind } from '../api/client';
import { getCachedCompanyPhoto, loadCompanyPhoto } from '../features/companies/companyPhotoCache';
import { ImageViewerModal } from './ImageViewerModal';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  companyId: string;
  kind: CompanyPhotoKind;
  count: number;
  // Ekran okuyucu için: "ofis fotoğrafı" / "sertifika".
  itemLabel: string;
  thumbSize?: number;
}

// Firma sayfasındaki yatay galeri (orijinal tasarım: "Firmanın ofisinden
// görseller", "Sertifikalar, başarılar"). Fotoğraflar firma yanıtında gelmiyor;
// burada tek tek çekilip dokununca tam ekran açılıyor.
export function CompanyPhotoGallery({ companyId, kind, count, itemLabel, thumbSize = 96 }: Props) {
  const [urls, setUrls] = useState<(string | null)[]>([]);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrls(Array.from({ length: count }, (_, i) => getCachedCompanyPhoto(companyId, kind, i) ?? null));
    let cancelled = false;
    for (let i = 0; i < count; i++) {
      if (getCachedCompanyPhoto(companyId, kind, i)) continue;
      loadCompanyPhoto(companyId, kind, i)
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
  }, [companyId, kind, count]);

  if (count === 0) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {Array.from({ length: count }, (_, i) => {
          const url = urls[i];
          return (
            <Pressable
              key={i}
              onPress={() => url && setViewerUrl(url)}
              disabled={!url}
              accessibilityRole="imagebutton"
              accessibilityLabel={`${itemLabel} ${i + 1} / ${count}`}
              accessibilityHint="Tam ekran büyütür"
              style={({ pressed }) => [{ width: thumbSize, height: thumbSize }, pressed && styles.pressed]}
            >
              {url ? (
                <Image source={{ uri: url }} style={[styles.thumb, { width: thumbSize, height: thumbSize }]} />
              ) : (
                <View style={[styles.thumb, styles.placeholder, { width: thumbSize, height: thumbSize }]}>
                  <ActivityIndicator color={colors.chevron} />
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.hint}>Büyütmek için fotoğrafa dokunun.</Text>
      <ImageViewerModal imageUrl={viewerUrl} visible={!!viewerUrl} onClose={() => setViewerUrl(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.surface },
  strip: { gap: spacing.sm, paddingHorizontal: spacing.gutter, paddingTop: spacing.sm },
  thumb: { borderRadius: radius.md, backgroundColor: colors.surfaceTonal },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85 },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
  },
});
