import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MIN_TOUCH, colors, radius, typography } from '../theme';

interface Props<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  // Ekran okuyucu için neyin birimi olduğu, örn. "1. iplik numara sistemi".
  label: string;
}

// Tablo satırında yer kaplamayan birim seçici: dokundukça sıradaki birime
// geçer. Çip satırı her iplik için bir satır daha yer kaplıyordu.
export function UnitToggle<T extends string>({ options, value, onChange, label }: Props<T>) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const current = options[index];
  const next = options[(index + 1) % options.length];

  return (
    <Pressable
      onPress={() => onChange(next.value)}
      style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${current.label}`}
      accessibilityHint={`Dokununca ${next.label} olur`}
      hitSlop={4}
    >
      <Text style={styles.text}>{current.label}</Text>
      <Ionicons name="swap-vertical" size={11} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggle: {
    minHeight: MIN_TOUCH - 4,
    minWidth: 52,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  pressed: { opacity: 0.7 },
  text: { ...typography.label, color: colors.primary },
});
