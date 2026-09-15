import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from './PrimaryButton';
import { ApiError } from '../api/client';
import { colors, fonts, radius, spacing, typography } from '../theme';

type IconName = keyof typeof Ionicons.glyphMap;

// Boş liste, bulunamadı ve hata ekranları tek bir kalıptan çıkıyor: ne olduğu
// (başlık), neden / ne yapılabilir (açıklama) ve varsa tek bir sonraki adım.
// Eskiden bunlar liste ortasında tek satır gri yazıydı ve çıkış yolu yoktu.
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
  icon: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'neutral' | 'error';
  // Liste içinde (başlık bölümünün altında) daha az dikey boşlukla.
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isError = tone === 'error';
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact, style]} accessibilityLiveRegion="polite">
      <View style={[styles.iconWrap, isError && styles.iconWrapError]}>
        <Ionicons name={icon} size={26} color={isError ? colors.danger : colors.primary} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <PrimaryButton label={actionLabel} variant="secondary" onPress={onAction} style={styles.action} />
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
    return 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.';
  }
  return error instanceof Error ? error.message : fallback;
}

export function ErrorState({
  error,
  fallback = 'Bir şeyler ters gitti.',
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
      title="Yüklenemedi"
      message={friendlyMessage(error, fallback)}
      actionLabel={onRetry ? 'Tekrar dene' : undefined}
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
  return (
    <View style={[styles.inline, style]} accessibilityRole="alert">
      <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
      <Text style={styles.inlineText}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} hitSlop={10} accessibilityRole="button">
          <Text style={styles.inlineAction}>Tekrar dene</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl * 2,
  },
  wrapCompact: { paddingVertical: spacing.lg },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  iconWrapError: { backgroundColor: colors.dangerSoft },
  title: { ...typography.heading, color: colors.text, textAlign: 'center' },
  message: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    maxWidth: 320,
  },
  action: { marginTop: spacing.lg, alignSelf: 'center', minWidth: 160 },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  inlineText: { ...typography.label, fontFamily: fonts.regular, color: colors.danger, flex: 1 },
  inlineAction: { ...typography.label, fontFamily: fonts.semibold, color: colors.danger },
});
