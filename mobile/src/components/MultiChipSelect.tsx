import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '../features/haptics';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../theme';

interface Props {
  options: readonly { key: string; label: string }[];
  values: string[];
  onChange: (values: string[]) => void;
}

// Birden fazla seçilebilen çipler (kullanım amaçları). Tek seçimlik olanlar
// için ChipSelect.
export function MultiChipSelect({ options, values, onChange }: Props) {
  const toggle = (key: string) => {
    haptics.selection();
    onChange(values.includes(key) ? values.filter((v) => v !== key) : [...values, key]);
  };

  return (
    <View style={styles.row}>
      {options.map((option) => {
        const selected = values.includes(option.key);
        return (
          <Pressable
            key={option.key}
            onPress={() => toggle(option.key)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            // react-native-web accessibilityState.checked'i aria-checked'e
            // çevirmiyor (tarayıcıda doğrulandı); ekran okuyucu seçimi duysun.
            aria-checked={selected}
            accessibilityLabel={option.label}
            style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && !selected && styles.chipPressed]}
          >
            {selected ? <Ionicons name="checkmark" size={16} color={colors.primaryText} /> : null}
            <Text style={[styles.text, selected && styles.textSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    minHeight: MIN_TOUCH - 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceTonal,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipPressed: { backgroundColor: colors.pressed },
  text: { ...typography.label, fontFamily: fonts.medium, color: colors.text },
  textSelected: { color: colors.primaryText },
});
