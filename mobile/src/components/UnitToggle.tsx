import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../ui';

interface Props<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  // Ekran okuyucu için neyin birimi olduğu, örn. "1. iplik numara sistemi".
  label: string;
}

// Tablo satırında yer kaplamayan birim seçici: dokundukça sıradaki birime
// geçer. Çip satırı her iplik için bir satır daha yer kaplıyordu.
// Dokunulabilir olduğu belli olsun diye `brandSoft` zemin + `brand` metin.
export function UnitToggle<T extends string>({ options, value, onChange, label }: Props<T>) {
  const t = useTheme();
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const current = options[index];
  const next = options[(index + 1) % options.length];

  return (
    <Pressable
      onPress={() => onChange(next.value)}
      style={({ pressed }) => [
        {
          minHeight: t.size.touchMin,
          paddingHorizontal: t.space[2],
          borderRadius: t.radius.md,
          backgroundColor: t.colors.brandSoft,
          gap: t.space[1],
        },
        styles.box,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${current.label}`}
      accessibilityHint={`Dokununca ${next.label} olur`}
      hitSlop={4}
    >
      <Text numberOfLines={1} style={[t.type.label14, { color: t.colors.brand }]}>
        {current.label}
      </Text>
      <Icon name="swap-vertical-outline" size={t.size.iconXs} color="brand" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Yalnızca yerleşim; renk ve boşluk yukarıda token'dan geliyor.
  box: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexShrink: 1, minWidth: 0 },
  pressed: { opacity: 0.7 },
});
