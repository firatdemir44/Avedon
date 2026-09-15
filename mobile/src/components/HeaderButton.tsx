import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MIN_TOUCH, colors, radius, typography } from '../theme';

type IconName = keyof typeof Ionicons.glyphMap;

// Lacivert üst bantta eylem düğmesi. Taslaklarda başlık eylemleri ikon
// (Akış: ✦ ve +) ya da ikon + kısa etiket (Mesajlar: + Yeni); düz metin yok
// (denetim FINDING-016). Etiket gizliyse ekran okuyucu için `label` okunur.
export function HeaderButton({
  icon,
  label,
  showLabel = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  showLabel?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.button, showLabel && styles.withLabel, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={showLabel ? 18 : 22} color={colors.primaryText} />
      {showLabel ? <Text style={styles.label}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: MIN_TOUCH,
    height: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: radius.md,
  },
  withLabel: { paddingHorizontal: 8 },
  // Lacivert bant üzerinde basılı durum: hafif açık zemin.
  pressed: { backgroundColor: 'rgba(255,255,255,0.14)' },
  label: { ...typography.subtitle, color: colors.primaryText },
});
