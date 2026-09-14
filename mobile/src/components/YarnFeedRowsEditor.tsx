import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TableInput } from './TableInput';
import { UnitToggle } from './UnitToggle';
import type { YarnCountSystem, YarnFeedRow } from '../features/calculators/formulas';
import { parseNumber } from '../features/calculators/parse';
import { MIN_TOUCH, colors, radius, spacing, typography } from '../theme';

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
  maxRows?: number;
}

// Kullanıcı isteği (2026-09-14): her iplik ayrı büyük kutuda alt alta üç alan
// olunca ekran çok uzuyordu. Artık tek satır = tek iplik, küçük tablo.
export function YarnFeedRowsEditor({ rows, onChange, maxRows = 6 }: Props) {
  const updateRow = (index: number, patch: Partial<YarnFeedRowFields>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <View style={styles.table}>
      <View style={styles.row}>
        <Text style={[styles.head, styles.colIndex]}>#</Text>
        <Text style={[styles.head, styles.colLength]}>50 iğne (cm)</Text>
        <Text style={[styles.head, styles.colCount]}>Numara</Text>
        <Text style={[styles.head, styles.colFeeders]}>Sistem sayısı</Text>
        <View style={styles.colRemove} />
      </View>

      {rows.map((row, index) => (
        <View key={index} style={styles.row}>
          <Text style={[styles.index, styles.colIndex]}>{index + 1}</Text>
          <TableInput
            style={styles.colLength}
            value={row.length}
            onChangeText={(v) => updateRow(index, { length: v })}
            placeholder="15,5"
            accessibilityLabel={`${index + 1}. iplik, 50 iğne iplik uzunluğu, santimetre`}
          />
          <View style={[styles.colCount, styles.countCell]}>
            <TableInput
              style={styles.countInput}
              value={row.count}
              onChangeText={(v) => updateRow(index, { count: v })}
              placeholder={row.system === 'denye' ? '20' : '30'}
              accessibilityLabel={`${index + 1}. iplik numarası`}
            />
            <UnitToggle
              options={FEED_SYSTEM_OPTIONS}
              value={row.system}
              onChange={(system) => updateRow(index, { system })}
              label={`${index + 1}. iplik numara sistemi`}
            />
          </View>
          <TableInput
            style={styles.colFeeders}
            keyboardType="number-pad"
            value={row.feeders}
            onChangeText={(v) => updateRow(index, { feeders: v })}
            placeholder="102"
            accessibilityLabel={`${index + 1}. iplik sistem sayısı`}
          />
          {rows.length > 1 ? (
            <Pressable
              style={styles.colRemove}
              onPress={() => onChange(rows.filter((_, i) => i !== index))}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${index + 1}. ipliği kaldır`}
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          ) : (
            <View style={styles.colRemove} />
          )}
        </View>
      ))}

      {rows.length < maxRows ? (
        <Pressable
          onPress={() => onChange([...rows, { ...EMPTY_FEED_ROW }])}
          style={styles.addRow}
          accessibilityRole="button"
        >
          <Ionicons name="add" size={18} color={colors.accent} />
          <Text style={styles.addText}>İplik ekle</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const tableStyles = StyleSheet.create({
  table: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    marginBottom: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  head: { ...typography.caption, fontWeight: '600', color: colors.textMuted, textAlign: 'center' },
  index: { ...typography.label, color: colors.primary, textAlign: 'center' },
  colIndex: { width: 16 },
  colRemove: { width: 24, alignItems: 'center', justifyContent: 'center', minHeight: MIN_TOUCH - 4 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: MIN_TOUCH,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  addText: { ...typography.label, color: colors.accent },
});

const styles = StyleSheet.create({
  ...tableStyles,
  colLength: { flex: 1.1 },
  colCount: { flex: 2 },
  countCell: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  countInput: { flex: 1 },
  colFeeders: { flex: 1.1 },
});
