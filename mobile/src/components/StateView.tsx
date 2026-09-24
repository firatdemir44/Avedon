import React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ApiError } from '../api/client';
import { useTheme } from '../theme/ThemeContext';
import { Button, Icon, type AnyIconName } from '../ui';
import { tr } from '../i18n';

// Boş liste, bulunamadı ve hata ekranları tek bir kalıptan çıkıyor: ne olduğu
// (başlık), neden / ne yapılabilir (açıklama) ve varsa tek bir sonraki adım.
//
// Yeni tasarım (4. adım): DESIGN.md §3 "Boş durum" — 48px kontur ikon `ink3`
// (hata tonunda `danger`), zemin kutusu YOK, `title18` başlık, `body14` `ink2`
// tek cümle (en çok 280px), altında kenarlıklı düğme.
export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  tone = 'neutral',
  compact,
  style,
}: {
  icon: AnyIconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'neutral' | 'error';
  // Liste içinde (başlık bölümünün altında) daha az dikey boşlukla.
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const isError = tone === 'error';
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        {
          alignItems: 'center',
          gap: t.space[3],
          paddingHorizontal: t.space[5],
          paddingVertical: compact ? t.space[6] : t.space[10],
        },
        style,
      ]}
    >
      <Icon name={icon} size={t.size.emptyIcon} color={isError ? 'danger' : 'ink3'} />
      <Text accessibilityRole="header" style={[t.type.title18, { color: t.colors.ink, textAlign: 'center' }]}>
        {title}
      </Text>
      {message ? (
        <Text
          style={[
            t.type.body14,
            { color: t.colors.ink2, textAlign: 'center', maxWidth: t.size.emptyTextWidth },
          ]}
        >
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: t.space[2] }}>
          <Button kind="secondary" label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

// Sunucu "bulunamadı" dediyse tekrar denemenin anlamı yok: hata değil boş durum.
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

// Sunucuya hiç ulaşılamadığında (fetch hatası) mesaj teknik oluyor
// ("Network request failed"); kullanıcıya ne yapacağını söyleyen metin gösteriyoruz.
export function friendlyMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (typeof error === 'string') return error;
  if (error instanceof Error && /network|fetch|timeout|aborted/i.test(error.message)) {
    return tr('Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.');
  }
  return error instanceof Error ? error.message : fallback;
}

export function ErrorState({
  error,
  fallback = tr('Bir şeyler ters gitti.'),
  onRetry,
  compact,
}: {
  error: unknown;
  fallback?: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      tone="error"
      title={tr('Yüklenemedi')}
      message={friendlyMessage(error, fallback)}
      actionLabel={onRetry ? tr('Tekrar dene') : undefined}
      onAction={onRetry}
      compact={compact}
    />
  );
}

// Veri ekrandayken arka planda yenileme başarısız olursa: içerik kalıyor,
// üstte ince bir şerit hatayı söylüyor.
export function InlineError({
  message,
  onRetry,
  style,
}: {
  message: string;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[2],
          backgroundColor: t.colors.dangerSoft,
          borderRadius: t.radius.md,
          paddingHorizontal: t.space[3],
          paddingVertical: t.space[3],
          minWidth: 0,
        },
        style,
      ]}
    >
      <Icon name="warning" size={t.size.iconSm} color="danger" />
      <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          hitSlop={t.space[3]}
          style={{ minHeight: t.size.touchMin, justifyContent: 'center' }}
        >
          <Text style={[t.type.label14, { color: t.colors.danger }]}>{tr('Tekrar dene')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
