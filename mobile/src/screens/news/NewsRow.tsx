// Sektör gündemi haber satırı: kaynak baş harfi, 2 satır başlık, "Kaynak · zaman".
// Telif ve gizlilik: yalnızca başlık / kısa özet; resim yüklenmez. Dokununca haber sitesinde açılır.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NewsItem } from '../../api/client';
import { openExternalUrl } from '../../components/LinkPreviewCard';
import { formatRelativeTime } from '../../features/time';
import { useTheme } from '../../theme/ThemeContext';
import { tr } from '../../i18n';
import { Avatar, Button } from '../../ui';

export interface NewsRowProps {
  item: NewsItem;
  /** Kısa özet de gösterilsin (liste ekranı). */
  showSummary?: boolean;
  onShare?: (item: NewsItem) => void;
}

export function NewsRow({ item, showSummary, onShare }: NewsRowProps) {
  const t = useTheme();
  const meta = [item.source, formatRelativeTime(item.publishedAt), item.lang === 'en' ? tr('İngilizce') : null].filter(Boolean).join(' · ');
  return (
    <View style={{ flexDirection: 'row', gap: t.space[3], minWidth: 0 }}>
      <Avatar name={item.source} size={t.size.avatarSm} />
      <View style={{ flex: 1, minWidth: 0, gap: t.space[1] }}>
        <Pressable
          onPress={() => openExternalUrl(item.url)}
          accessibilityRole="link"
          accessibilityLabel={tr('{title}, {source}. Haberi aç', { title: item.title, source: item.source })}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, gap: t.space[1] })}
        >
          <Text numberOfLines={2} style={[t.type.label14, { color: t.colors.ink }]}>
            {item.title}
          </Text>
          {showSummary && item.summary ? (
            <Text numberOfLines={3} style={[t.type.body14, { color: t.colors.ink2 }]}>
              {item.summary}
            </Text>
          ) : null}
          <Text numberOfLines={1} style={[t.type.caption12, { color: t.colors.ink2 }]}>
            {meta}
          </Text>
        </Pressable>
        {onShare ? (
          <View style={{ flexDirection: 'row' }}>
            <Button kind="quiet" icon="share" label={tr('Akışta paylaş')} onPress={() => onShare(item)} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
