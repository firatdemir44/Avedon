import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextField } from '../../components/TextField';
import { ResultCard } from '../../components/ResultCard';
import { convertYarnCount, type YarnCountSystem } from '../../features/calculators/formulas';
import { parseNumber, formatNumber } from '../../features/calculators/parse';
import { colors, radius, spacing } from '../../theme';

const SYSTEMS: { value: YarnCountSystem; label: string }[] = [
  { value: 'tex', label: 'Tex' },
  { value: 'nm', label: 'Nm (Metrik)' },
  { value: 'ne', label: 'Ne (İngiliz Pamuk)' },
  { value: 'denye', label: 'Denye' },
];

export function YarnCountCalculator() {
  const [system, setSystem] = useState<YarnCountSystem>('tex');
  const [value, setValue] = useState('');

  const result = useMemo(() => {
    const n = parseNumber(value);
    if (!value || n <= 0) return null;
    return convertYarnCount(n, system);
  }, [value, system]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Sistem</Text>
        <View style={styles.systemRow}>
          {SYSTEMS.map((s) => (
            <Pressable
              key={s.value}
              onPress={() => setSystem(s.value)}
              style={[styles.chip, system === s.value && styles.chipSelected]}
            >
              <Text style={[styles.chipText, system === s.value && styles.chipTextSelected]}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
        <TextField label="Değer" keyboardType="numeric" value={value} onChangeText={setValue} placeholder="Örn. 30" />

        {result ? (
          <ResultCard
            rows={[
              { label: 'Tex', value: formatNumber(result.tex) },
              { label: 'Nm (Metrik)', value: formatNumber(result.nm) },
              { label: 'Ne (İngiliz Pamuk)', value: formatNumber(result.ne) },
              { label: 'Denye', value: formatNumber(result.denye) },
            ]}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  systemRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  chipText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: colors.primaryText,
  },
});
