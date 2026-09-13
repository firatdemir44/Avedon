import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { MIN_TOUCH, colors, radius, shadow, spacing, typography } from '../theme';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'default' | 'danger';
}

export function MenuRow({ label, onPress, variant = 'default' }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
    >
      <Text style={[styles.label, variant === 'danger' && styles.labelDanger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  rowPressed: { backgroundColor: colors.surfaceTonal },
  label: { ...typography.bodyStrong, color: colors.text },
  labelDanger: { color: colors.danger },
});
