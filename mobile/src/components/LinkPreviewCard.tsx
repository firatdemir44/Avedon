// Paylaşılan haber/makale bağlantısının kartı (LinkedIn benzeri): üstte görsel
// (varsa), site adı, 2 satır kalın başlık, 2 satır açıklama. Dokununca bağlantı
// açılır; paylaşım ekranında sağ üstte kaldırma (x) düğmesi olur.
import React from 'react';
import { ActivityIndicator, Image, Linking, Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../ui';

export interface LinkPreviewCardProps {
  url: string;
  title: string;
  description: string;
  siteName: string;
  /** Görsel adresi; null ve hasImage true ise yer tutucu gösterilir. */
  imageUri: string | null;
  hasImage: boolean;
  /** Önizleme alınıyor. */
  loading?: boolean;
  onRemove?: () => void;
  /** Verilmezse dokununca bağlantı açılır. */
  onPress?: () => void;
  /** Akış gönderisi: kenarlık/köşe yok, görsel tam genişlik, metin bloğu surface-2 zeminde. */
  flush?: boolean;
}

export function hostOf(url: string): string {
  const m = url.match(/^https?:\/\/([^/?#:]+)/i);
  return m ? m[1].replace(/^www\./i, '') : url;
}

export function openExternalUrl(url: string) {
  if (!/^https?:\/\//i.test(url)) return;
  Linking.openURL(url).catch(() => {
    // Açılamazsa sessiz: kullanıcı adresi kartta görüyor.
  });
}

export function LinkPreviewCard({ url, title, description, siteName, imageUri, hasImage, loading, onRemove, onPress, flush }: LinkPreviewCardProps) {
  const t = useTheme();
  const site = siteName || hostOf(url);
  const heading = title || hostOf(url);

  return (
    <View
      style={{
        borderRadius: flush ? 0 : t.radius.md,
        borderWidth: flush ? 0 : 1,
        borderColor: t.colors.line,
        backgroundColor: flush ? t.colors.surface2 : t.colors.surface1,
        overflow: 'hidden',
      }}
    >
      <Pressable
        onPress={onPress ?? (() => openExternalUrl(url))}
        accessibilityRole="link"
        accessibilityLabel={`${heading}, ${site}. Bağlantıyı aç`}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      >
        {hasImage ? (
          <View
            style={{
              width: '100%',
              aspectRatio: 1.91,
              backgroundColor: t.colors.surface2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {imageUri ? (
              <Image source={{ uri: imageUri }} resizeMode="cover" style={{ width: '100%', height: '100%' }} accessibilityIgnoresInvertColors />
            ) : (
              <Icon name="image-outline" color="ink3" />
            )}
          </View>
        ) : null}
        <View style={{ gap: t.space[1], paddingVertical: flush ? t.space[2] : t.space[3], paddingHorizontal: flush ? t.space[4] : t.space[3], paddingRight: onRemove ? t.space[3] + t.size.touchMin : flush ? t.space[4] : t.space[3] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[1] }}>
            <Icon name="link-outline" size={t.size.iconSm} color="ink3" />
            <Text numberOfLines={1} style={[t.type.caption12, { color: t.colors.ink3, flex: 1, minWidth: 0 }]}>
              {site}
            </Text>
          </View>
          {loading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
              <ActivityIndicator color={t.colors.ink3} />
              <Text style={[t.type.body14, { color: t.colors.ink2 }]}>Önizleme alınıyor…</Text>
            </View>
          ) : (
            <>
              <Text numberOfLines={2} style={[t.type.body16Strong, { color: t.colors.ink }]}>
                {heading}
              </Text>
              {description ? (
                <Text numberOfLines={2} style={[t.type.body14, { color: t.colors.ink2 }]}>
                  {description}
                </Text>
              ) : null}
            </>
          )}
        </View>
      </Pressable>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel="Bağlantıyı kaldır"
          hitSlop={t.space[1]}
          style={{
            position: 'absolute',
            top: t.space[1],
            right: t.space[1],
            width: t.size.touchMin,
            height: t.size.touchMin,
            borderRadius: t.radius.full,
            backgroundColor: t.colors.surface1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="x" color="ink" />
        </Pressable>
      ) : null}
    </View>
  );
}
