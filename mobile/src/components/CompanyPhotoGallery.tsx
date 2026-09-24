import React, { useEffect, useState } from 'react';
import { tr } from '../i18n';
import { View, Text, Image, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import type { CompanyPhotoKind } from '../api/client';
import { getCachedCompanyPhoto, loadCompanyPhoto } from '../features/companies/companyPhotoCache';
import { ImageViewerModal } from './ImageViewerModal';
import { useTheme } from '../theme/ThemeContext';

// Küçük görsel karesi (DESIGN.md'de adı olmayan ekran-içi ölçü).
const THUMB_SIZE = 96;

interface Props {
  companyId: string;
  kind: CompanyPhotoKind;
  count: number;
  // Ekran okuyucu için: "ofis fotoğrafı" / "sertifika".
  itemLabel: string;
  thumbSize?: number;
}

// Firma sayfasındaki yatay galeri ("Firmanın ofisinden görseller",
// "Sertifikalar, başarılar"). Fotoğraflar firma yanıtında gelmiyor; burada
// tek tek çekilip dokununca tam ekran açılıyor. Görseller 1px line çerçeveli
// (DESIGN.md §3 kumaş görseli).
export function CompanyPhotoGallery({ companyId, kind, count, itemLabel, thumbSize = THUMB_SIZE }: Props) {
  const t = useTheme();
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

  const thumb = {
    width: thumbSize,
    height: thumbSize,
    borderRadius: t.radius.sm,
    borderWidth: 1,
    borderColor: t.colors.line,
    backgroundColor: t.colors.surface2,
    overflow: 'hidden' as const,
  };

  return (
    <View style={{ gap: t.space[2] }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: t.space[2] }}
      >
        {Array.from({ length: count }, (_, i) => {
          const url = urls[i];
          return (
            <Pressable
              key={i}
              onPress={() => url && setViewerUrl(url)}
              disabled={!url}
              accessibilityRole="imagebutton"
              accessibilityLabel={`${itemLabel} ${i + 1} / ${count}`}
              accessibilityHint={tr('Tam ekran büyütür')}
              style={({ pressed }) => [thumb, pressed && { opacity: 0.85 }]}
            >
              {url ? (
                <Image source={{ uri: url }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator color={t.colors.ink3} />
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{tr('Büyütmek için fotoğrafa dokunun.')}</Text>
      <ImageViewerModal imageUrl={viewerUrl} visible={!!viewerUrl} onClose={() => setViewerUrl(null)} />
    </View>
  );
}
