import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, radius, shadow, spacing, typography } from '../theme';

interface Row {
  label: string;
  value: string;
}

export function ResultCard({ rows }: { rows: Row[] }) {
  return (
    <View style={styles.card}>
      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <Text style={styles.label}>{row.label}</Text>
          <Text style={styles.value}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceTonal,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
    ...shadow.card,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  label: {
    ...typography.body,
    color: colors.textMuted,
  },
  value: {
    ...typography.bodyStrong,
    fontFamily: fonts.bold,
    color: colors.primary,
  },
});
