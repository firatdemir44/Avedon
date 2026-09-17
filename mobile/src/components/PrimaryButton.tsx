import React from 'react';
import { Pressable, Text, StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../theme';

type IconName = keyof typeof Ionicons.glyphMap;

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  // primary: lacivert dolu · secondary: tonlu zemin + çerçeve
  // outline: yalnızca güçlü çerçeve (taslaktaki "Firma" / "Firmam" düğmeleri)
  variant?: 'primary' | 'secondary' | 'outline';
  // sm: yan yana birkaç düğmenin sığması gereken yerler (akış kartının eylem
  // çubuğu) — yüksekliği yine 44, yazısı `label` ölçeğinde ve yatay boşluğu dar.
  // lg: ekran altına sabitlenen eylem çubuğundaki düğmeler (48px).
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  // 'assistant': yazı, ikon ve çerçeve asistan kızılı olur. YALNIZCA asistanın
  // kendisine giden düğmelerde (renk kuralı, MOBILE-DESIGN.md Asistan bölümü).
  tone?: 'assistant';
  style?: ViewStyle;
  accessibilityLabel?: string;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  variant = 'primary',
  size = 'md',
  icon,
  tone,
  style,
  accessibilityLabel,
}: Props) {
  const isPrimary = variant === 'primary';
  const textColor = tone === 'assistant' && !isPrimary ? colors.assistant : isPrimary ? colors.primaryText : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      android_ripple={{ color: isPrimary ? 'rgba(255,255,255,0.18)' : colors.pressed }}
      // 4. aşama: basılıyken dolu düğme hafif söner, çerçeveli düğmenin zemini
      // koyulaşır. İkisi de dokunmanın algılandığını anında gösterir.
      style={({ pressed }) => [
        styles.base,
        size === 'lg' && styles.large,
        size === 'sm' && styles.small,
        styles[variant],
        tone === 'assistant' && !isPrimary && { borderColor: colors.assistant },
        pressed && !disabled && (isPrimary ? styles.pressedPrimary : styles.pressedQuiet),
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={textColor} /> : null}
        <Text
          // Dar düğmede yazı alt satıra taşıp düğmeyi büyütmesin.
          numberOfLines={size === 'sm' ? 1 : undefined}
          style={[styles.text, size === 'sm' && styles.textSmall, { color: textColor }]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  large: { minHeight: 48, paddingHorizontal: spacing.md },
  small: { paddingHorizontal: 10, paddingVertical: spacing.sm },
  primary: { backgroundColor: colors.primary },
  secondary: {
    backgroundColor: colors.surfaceTonal,
    borderWidth: 1,
    borderColor: colors.border,
  },
  outline: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  pressedPrimary: { opacity: 0.85 },
  pressedQuiet: { backgroundColor: colors.pressed },
  disabled: { opacity: 0.4 },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 0 },
  text: { ...typography.subtitle },
  textSmall: { ...typography.label, fontFamily: fonts.semibold, flexShrink: 1 },
});
