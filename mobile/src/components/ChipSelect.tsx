import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../theme';

interface Props<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  // Satır içinde (örn. iplik numarası sistemi) daha küçük çipler.
  compact?: boolean;
}

// Hesap ekranlarında birbirini dışlayan seçenekler için. Önceden her ekran
// aynı çip satırını kendisi kopyalıyordu.
export function ChipSelect<T extends string>({ options, value, onChange, compact }: Props<T>) {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.chip, compact && styles.chipCompact, selected && styles.chipSelected]}
          >
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
    minHeight: MIN_TOUCH - 8,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceTonal,
  },
  chipCompact: { minHeight: 36, paddingHorizontal: spacing.sm + 2, paddingVertical: 6 },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  text: { ...typography.label, fontFamily: fonts.medium, color: colors.text },
  textSelected: { color: colors.primaryText },
});
