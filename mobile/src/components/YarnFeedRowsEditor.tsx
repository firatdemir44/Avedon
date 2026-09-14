import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { TextField } from './TextField';
import { ChipSelect } from './ChipSelect';
import { PrimaryButton } from './PrimaryButton';
import type { YarnCountSystem, YarnFeedRow } from '../features/calculators/formulas';
import { parseNumber, formatNumber } from '../features/calculators/parse';
import { colors, radius, spacing, typography } from '../theme';

// Alanlar metin olarak tutuluyor (kullanıcı "15," yazarken silinmesin diye);
// hesap anında sayıya çevriliyor.
export interface YarnFeedRowFields {
  length: string;
  count: string;
  system: YarnCountSystem;
  feeders: string;
}

export const EMPTY_FEED_ROW: YarnFeedRowFields = { length: '', count: '', system: 'ne', feeders: '' };

export const FEED_SYSTEM_OPTIONS: { value: YarnCountSystem; label: string }[] = [
  { value: 'ne', label: 'Ne' },
  { value: 'denye', label: 'Denye' },
  { value: 'nm', label: 'Nm' },
  { value: 'dtex', label: 'dtex' },
  { value: 'tex', label: 'Tex' },
];

export function toFeedRows(rows: YarnFeedRowFields[]): YarnFeedRow[] {
  return rows.map((row) => ({
    lengthPer50NeedlesCm: parseNumber(row.length),
    count: parseNumber(row.count),
    system: row.system,
    feeders: parseNumber(row.feeders),
  }));
}

interface Props {
  rows: YarnFeedRowFields[];
  onChange: (rows: YarnFeedRowFields[]) => void;
  // Hesaplanmışsa her iplik satırında payı gösterilir.
  percents?: number[];
  maxRows?: number;
}

export function YarnFeedRowsEditor({ rows, onChange, percents, maxRows = 6 }: Props) {
  const updateRow = (index: number, patch: Partial<YarnFeedRowFields>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <View>
      {rows.map((row, index) => (
        <View key={index} style={styles.block}>
          <View style={styles.blockHeader}>
            <Text style={styles.blockTitle}>{index + 1}. iplik</Text>
            {percents && percents[index] > 0 ? (
              <Text style={styles.percent}>%{formatNumber(percents[index], 1)}</Text>
            ) : null}
            {rows.length > 1 ? (
              <Pressable
                onPress={() => onChange(rows.filter((_, i) => i !== index))}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`${index + 1}. ipliği kaldır`}
              >
                <Text style={styles.remove}>Kaldır</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.twoCol}>
            <View style={styles.col}>
              <TextField
                label="50 iğne uzunluğu (cm)"
                keyboardType="decimal-pad"
                value={row.length}
                onChangeText={(v) => updateRow(index, { length: v })}
                placeholder="Örn. 15,5"
              />
            </View>
            <View style={styles.col}>
              <TextField
                label="Sistem sayısı"
                keyboardType="number-pad"
                value={row.feeders}
                onChangeText={(v) => updateRow(index, { feeders: v })}
                placeholder="Örn. 102"
              />
            </View>
          </View>

          <TextField
            label="İplik numarası"
            keyboardType="decimal-pad"
            value={row.count}
            onChangeText={(v) => updateRow(index, { count: v })}
            placeholder={row.system === 'denye' ? 'Örn. 20' : 'Örn. 30'}
          />
          <ChipSelect compact options={FEED_SYSTEM_OPTIONS} value={row.system} onChange={(system) => updateRow(index, { system })} />
        </View>
      ))}

      {rows.length < maxRows ? (
        <PrimaryButton
          label="İplik Ekle"
          variant="secondary"
          onPress={() => onChange([...rows, { ...EMPTY_FEED_ROW }])}
          style={{ marginBottom: spacing.lg }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    paddingBottom: 0,
    marginBottom: spacing.md,
  },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  blockTitle: { ...typography.bodyStrong, color: colors.primary, flex: 1 },
  percent: { ...typography.label, color: colors.accent },
  remove: { ...typography.label, color: colors.danger },
  twoCol: { flexDirection: 'row', gap: spacing.sm },
  col: { flex: 1 },
});
