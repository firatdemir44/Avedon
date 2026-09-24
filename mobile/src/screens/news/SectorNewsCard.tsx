// Ana sayfa akışının üstündeki "Sektör gündemi" kartı: firma türüne göre günün 5 başlığı.
// "Gizle" → kart o gün tek satıra iner (AsyncStorage'da tarih tutulur), ertesi gün yeniden açık gelir.
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchNewsDigest, type NewsItem } from '../../api/client';
import { useTheme } from '../../theme/ThemeContext';
import { Button, Card, Icon, SkeletonText } from '../../ui';
import { NewsRow } from './NewsRow';

const HIDDEN_KEY = 'avedon.newsDigestHiddenOn';
const MAX_ITEMS = 5;

function localDay(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export interface SectorNewsCardProps {
  /** Değişince özet yeniden çekilir (akışı aşağı çekip yenileme). */
  refreshKey?: number;
  onSeeAll: () => void;
}

export function SectorNewsCard({ refreshKey, onSeeAll }: SectorNewsCardProps) {
  const t = useTheme();
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(HIDDEN_KEY)
      .then((v) => !cancelled && setCollapsed(v === localDay()))
      .catch(() => !cancelled && setCollapsed(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(() => {
    let cancelled = false;
    fetchNewsDigest()
      .then((r) => {
        if (cancelled) return;
        setItems(r.items.slice(0, MAX_ITEMS));
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load, refreshKey]);

  const setHidden = (hidden: boolean) => {
    setCollapsed(hidden);
    (hidden ? AsyncStorage.setItem(HIDDEN_KEY, localDay()) : AsyncStorage.removeItem(HIDDEN_KEY)).catch(() => {
      // Hatırlanamazsa yalnızca bu oturumda gizli kalır.
    });
  };

  // Haber yoksa (henüz çekilmedi) ya da alınamadıysa kart hiç görünmez: akışı kalabalıklaştırmaz.
  if (collapsed === null || failed || (items && items.length === 0)) return null;

  if (collapsed) {
    return (
      <Pressable
        onPress={() => setHidden(false)}
        accessibilityRole="button"
        accessibilityLabel="Sektör gündemini göster"
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[2],
          minHeight: t.size.touchMin,
          paddingHorizontal: t.space[4],
          borderRadius: t.radius.lg,
          borderWidth: 1,
          borderColor: t.colors.line,
          backgroundColor: pressed ? t.colors.surface2 : t.colors.surface1,
        })}
      >
        <Icon name="newspaper-outline" size={t.size.iconSm} color="ink2" />
        <Text numberOfLines={1} style={[t.type.label14, { color: t.colors.ink, flex: 1, minWidth: 0 }]}>
          Sektör gündemi{items ? ` · ${items.length} başlık` : ''}
        </Text>
        <Text style={[t.type.label14, { color: t.colors.brand }]}>Göster</Text>
      </Pressable>
    );
  }

  return (
    <Card>
      <View style={{ gap: t.space[4] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
          <Icon name="newspaper-outline" size={t.size.iconSm} color="ink2" />
          <Text style={[t.type.body16Strong, { color: t.colors.ink, flex: 1, minWidth: 0 }]} numberOfLines={1}>
            Sektör gündemi
          </Text>
          <Pressable onPress={() => setHidden(true)} accessibilityRole="button" accessibilityLabel="Sektör gündemini bugün gizle" hitSlop={t.space[3]}>
            <Text style={[t.type.label14, { color: t.colors.ink2 }]}>Gizle</Text>
          </Pressable>
        </View>
        {items === null ? (
          <SkeletonText lines={4} />
        ) : (
          items.map((item) => <NewsRow key={item.id} item={item} />)
        )}
        <Button kind="secondary" label="Tümünü gör" onPress={onSeeAll} fullWidth />
      </View>
    </Card>
  );
}
