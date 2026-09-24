import React from 'react';
import { Text, View } from 'react-native';
import { TableInput } from './TableInput';
import { UnitToggle } from './UnitToggle';
import { CalcSubRow, CalcSubHeadCell, CalcAddRow, CalcRemoveCell, calcCells } from './CalcTable';
import type { YarnCountSystem, YarnFeedRow } from '../features/calculators/formulas';
import { parseNumber } from '../features/calculators/parse';
import { useTheme } from '../theme/ThemeContext';
import { tr } from '../i18n';

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
  const t = useTheme();
  const updateRow = (index: number, patch: Partial<YarnFeedRowFields>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <>
      <CalcSubRow header>
        <CalcSubHeadCell label="#" style={calcCells.index} />
        <CalcSubHeadCell label={tr('50 iğne cm')} style={calcCells.flex11} />
        <CalcSubHeadCell label={tr('Numara')} style={calcCells.flex2} />
        <CalcSubHeadCell label={tr('Sistem')} style={calcCells.flex11} />
        <View style={{ width: t.size.icon }} />
      </CalcSubRow>

      {rows.map((row, index) => (
        <CalcSubRow key={index}>
          <Text style={[t.type.caption12, calcCells.index, { color: t.colors.brand }]}>{index + 1}</Text>
          <TableInput
            style={calcCells.flex11}
            value={row.length}
            onChangeText={(v) => updateRow(index, { length: v })}
            placeholder="15,5"
            accessibilityLabel={tr('{n}. iplik, 50 iğne iplik uzunluğu, santimetre', { n: index + 1 })}
          />
          <View style={[calcCells.flex2, { flexDirection: 'row', alignItems: 'center', gap: t.space[1] }]}>
            <TableInput
              style={calcCells.flex1}
              value={row.count}
              onChangeText={(v) => updateRow(index, { count: v })}
              placeholder={row.system === 'denye' ? '20' : '30'}
              accessibilityLabel={tr('{n}. iplik numarası', { n: index + 1 })}
            />
            <UnitToggle
              options={FEED_SYSTEM_OPTIONS}
              value={row.system}
              onChange={(system) => updateRow(index, { system })}
              label={tr('{n}. iplik numara sistemi', { n: index + 1 })}
            />
          </View>
          <TableInput
            style={calcCells.flex11}
            keyboardType="number-pad"
            value={row.feeders}
            onChangeText={(v) => updateRow(index, { feeders: v })}
            placeholder="102"
            accessibilityLabel={tr('{n}. iplik sistem sayısı', { n: index + 1 })}
          />
          <CalcRemoveCell
            label={tr('{n}. ipliği kaldır', { n: index + 1 })}
            onPress={rows.length > 1 ? () => onChange(rows.filter((_, i) => i !== index)) : undefined}
          />
        </CalcSubRow>
      ))}

      {rows.length < maxRows ? (
        <CalcAddRow label={tr('İplik ekle')} onPress={() => onChange([...rows, { ...EMPTY_FEED_ROW }])} />
      ) : null}
    </>
  );
}
