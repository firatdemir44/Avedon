import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MIN_TOUCH, colors, fonts, radius, typography } from '../theme';

type IconName = keyof typeof Ionicons.glyphMap;

// Lacivert üst bantta eylem düğmesi. Taslaklarda başlık eylemleri ikon
// (Akış: ✦ ve +) ya da ikon + kısa etiket (Mesajlar: + Yeni); düz metin yok
// (denetim FINDING-016). Etiket gizliyse ekran okuyucu için `label` okunur.
export function HeaderButton({
  icon,
  label,
  showLabel = false,
  badge,
  onPress,
}: {
  icon: IconName;
  label: string;
  showLabel?: boolean;
  // Okunmamış sayısı (kırmızı rozet). 0/undefined ise rozet çizilmez; 99'dan
  // fazlası "99+" olur (Mesajlar sekmesindeki rozetle aynı renk ve biçim).
  badge?: number;
  onPress: () => void;
}) {
  const count = badge && badge > 0 ? badge : 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `${label}, ${count} okunmamış` : label}
      style={({ pressed }) => [styles.button, showLabel && styles.withLabel, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={showLabel ? 18 : 22} color={colors.primaryText} />
      {showLabel ? <Text style={styles.label}>{label}</Text> : null}
      {count > 0 ? (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
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
  badge: {
    position: 'absolute',
    top: 3,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.notification,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 15, color: colors.primaryText },
});
