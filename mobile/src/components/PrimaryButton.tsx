import React from 'react';
import { Pressable, Text, StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MIN_TOUCH, colors, radius, spacing, typography } from '../theme';

type IconName = keyof typeof Ionicons.glyphMap;

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  // primary: lacivert dolu · secondary: tonlu zemin + çerçeve
  // outline: yalnızca güçlü çerçeve (taslaktaki "Firma" / "Firmam" düğmeleri)
  variant?: 'primary' | 'secondary' | 'outline';
  // lg: ekran altına sabitlenen eylem çubuğundaki düğmeler (48px).
  size?: 'md' | 'lg';
  icon?: IconName;
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
  style,
  accessibilityLabel,
}: Props) {
  const isPrimary = variant === 'primary';
  const textColor = isPrimary ? colors.primaryText : colors.primary;
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
        styles[variant],
        pressed && !disabled && (isPrimary ? styles.pressedPrimary : styles.pressedQuiet),
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {icon ? <Ionicons name={icon} size={18} color={textColor} /> : null}
        <Text style={[styles.text, { color: textColor }]}>{label}</Text>
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
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { ...typography.subtitle },
});
