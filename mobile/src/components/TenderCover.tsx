// Açık talep kapak fotoğrafı (liste satırı ve akış kartı) + "N ek" satırı.
// Fotoğraf verisi ayrı uçtan geliyor (data URL); aynı talep her kaydırmada
// yeniden istenmesin diye bellekte tutulur.
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { fetchTenderMedia } from '../api/client';
import { tenderAttachmentText } from '../features/tenders/format';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../ui';

const CACHE_LIMIT = 60;
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

export function loadTenderMedia(tenderId: string, mediaId: string): Promise<string | null> {
  const hit = cache.get(mediaId);
  if (hit) return Promise.resolve(hit);
  const running = pending.get(mediaId);
  if (running) return running;
  const p = fetchTenderMedia(tenderId, mediaId)
    .then(({ dataUrl }) => {
      if (cache.size >= CACHE_LIMIT) {
        const first = cache.keys().next().value;
        if (first) cache.delete(first);
      }
      cache.set(mediaId, dataUrl);
      return dataUrl;
    })
    .catch(() => null)
    .finally(() => pending.delete(mediaId));
  pending.set(mediaId, p);
  return p;
}

export function useTenderMedia(tenderId: string, mediaId: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(() => (mediaId ? cache.get(mediaId) ?? null : null));
  useEffect(() => {
    if (!mediaId) {
      setUrl(null);
      return;
    }
    let alive = true;
    loadTenderMedia(tenderId, mediaId).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [tenderId, mediaId]);
  return url;
}

export function TenderCoverThumb({ tenderId, mediaId }: { tenderId: string; mediaId: string }) {
  const t = useTheme();
  const url = useTenderMedia(tenderId, mediaId);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: t.size.thumb,
        height: t.size.thumb,
        borderRadius: t.radius.md,
        overflow: 'hidden',
        backgroundColor: t.colors.surface2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {url ? (
        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      ) : (
        <Icon name="image-outline" size={t.size.iconSm} color="ink3" />
      )}
    </View>
  );
}

export function TenderAttachmentLine({ mediaCount, videoCount }: { mediaCount?: number; videoCount?: number }) {
  const t = useTheme();
  const text = tenderAttachmentText({ mediaCount, videoCount });
  if (!text) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[1] }}>
      <Icon name="attach-outline" size={t.size.iconSm} color="ink3" />
      <Text style={[t.type.caption12, { color: t.colors.ink3 }]}>{text}</Text>
    </View>
  );
}
