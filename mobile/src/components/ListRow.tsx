import React from 'react';
import { View, Text, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, typography } from '../theme';

// Yeni düzenin temel satırı (tasarım 5. aşama): beyaz blok içinde, alttan ince
// çizgiyle ayrılan, dokunulabiliyorsa sonunda ok olan satır. Kutu yığını
// (FINDING-006) yerine Profil menüsü, Firma çalışanları, Hesaplamalar ve
// benzeri listeler bununla çiziliyor.
//
// 4. aşama: basılıyken zemin bir ton koyulaşır (colors.pressed). Android'de
// ayrıca sistem dalgası (ripple) var; iOS ve web'de yalnızca zemin.
export function ListRow({
  title,
  subtitle,
  onPress,
  left,
  right,
  chevron,
  divider = true,
  tone = 'default',
  minHeight = 52,
  style,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  left?: React.ReactNode;
  // Oktan önce duran ek bilgi: sayı, rozet.
  right?: React.ReactNode;
  // Varsayılan: dokunulabiliyorsa ok var.
  chevron?: boolean;
  divider?: boolean;
  tone?: 'default' | 'danger';
  minHeight?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const showChevron = chevron ?? !!onPress;
  const content = (
    <>
      {left}
      <View style={styles.texts}>
        <Text
          style={[styles.title, subtitle ? styles.titleStrong : null, tone === 'danger' && styles.titleDanger]}
          numberOfLines={2}
        >
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
      {showChevron ? <Ionicons name="chevron-forward" size={18} color={colors.chevron} /> : null}
    </>
  );

  const rowStyle = [styles.row, { minHeight }, divider && styles.divider, style];

  if (!onPress) {
    return <View style={rowStyle}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      android_ripple={{ color: colors.pressed }}
      style={({ pressed }) => [...rowStyle, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.gutter,
    paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  pressed: { backgroundColor: colors.pressed },
  texts: { flex: 1, gap: 1 },
  title: { ...typography.subtitle, fontFamily: fonts.medium, color: colors.text },
  titleStrong: { fontFamily: fonts.semibold },
  titleDanger: { fontFamily: fonts.semibold, color: colors.danger },
  subtitle: { ...typography.label, fontFamily: fonts.regular, lineHeight: 17, color: colors.textMuted },
});
