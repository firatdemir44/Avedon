import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../theme';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'default' | 'danger';
}

export function MenuRow({ label, onPress, variant = 'default' }: Props) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Text style={[styles.label, variant === 'danger' && styles.labelDanger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  labelDanger: { color: colors.danger },
});
