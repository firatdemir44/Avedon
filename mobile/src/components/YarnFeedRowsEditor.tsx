import React from 'react';
import { View, StyleSheet } from 'react-native';
import { TableInput } from './TableInput';
import { UnitToggle } from './UnitToggle';
import { CalcSubRow, CalcSubHeadCell, CalcAddRow, CalcRemoveCell, calcCells } from './CalcTable';
import type { YarnCountSystem, YarnFeedRow } from '../features/calculators/formulas';
import { parseNumber } from '../features/calculators/parse';
import { colors, typography } from '../theme';

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
// olunca ekran çok uzuyordu — tek satır = tek iplik. 2026-09-21'de hesap
// tablosu kalıbına uyduruldu: KENDİ çerçevesi yok, bir `CalcTable` içinde
// alt tablo olarak durur (aynı satır çizgileri, gri sütun başlıkları).
export function YarnFeedRowsEditor({ rows, onChange, maxRows = 6 }: Props) {
  const updateRow = (index: number, patch: Partial<YarnFeedRowFields>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <>
      <CalcSubRow header>
        <CalcSubHeadCell label="#" style={styles.colIndexHead} />
        <CalcSubHeadCell label="50 iğne cm" style={calcCells.flex11} />
        <CalcSubHeadCell label="Numara" style={calcCells.flex2} />
        <CalcSubHeadCell label="Sistem" style={calcCells.flex11} />
        <View style={styles.colRemoveHead} />
      </CalcSubRow>

      {rows.map((row, index) => (
        <CalcSubRow key={index}>
          <View style={styles.index}>
            <CalcSubHeadCell label={String(index + 1)} style={styles.indexText} />
          </View>
          <TableInput
            style={calcCells.flex11}
            value={row.length}
            onChangeText={(v) => updateRow(index, { length: v })}
            placeholder="15,5"
            accessibilityLabel={`${index + 1}. iplik, 50 iğne iplik uzunluğu, santimetre`}
          />
          <View style={[calcCells.flex2, styles.countCell]}>
            <TableInput
              style={calcCells.flex1}
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
            style={calcCells.flex11}
            keyboardType="number-pad"
            value={row.feeders}
            onChangeText={(v) => updateRow(index, { feeders: v })}
            placeholder="102"
            accessibilityLabel={`${index + 1}. iplik sistem sayısı`}
          />
          <CalcRemoveCell
            label={`${index + 1}. ipliği kaldır`}
            onPress={rows.length > 1 ? () => onChange(rows.filter((_, i) => i !== index)) : undefined}
          />
        </CalcSubRow>
      ))}

      {rows.length < maxRows ? (
        <CalcAddRow label="İplik ekle" onPress={() => onChange([...rows, { ...EMPTY_FEED_ROW }])} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  colIndexHead: { width: 16 },
  colRemoveHead: { width: 24 },
  index: { width: 16 },
  countCell: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  indexText: { ...typography.caption, fontSize: 13, color: colors.primary, textAlign: 'center' },
});
