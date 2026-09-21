import React, { useMemo } from 'react';
import { Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CalcTable,
  CalcSectionRow,
  CalcResultRow,
  CalcNoteRow,
  CalcFormulaRow,
  CalcClearButton,
} from '../../components/CalcTable';
import {
  EMPTY_FEED_ROW,
  YarnFeedRowsEditor,
  toFeedRows,
  type YarnFeedRowFields,
} from '../../components/YarnFeedRowsEditor';
import { yarnUsageRatios } from '../../features/calculators/formulas';
import { formatNumber } from '../../features/calculators/parse';
import { usePersistedFields } from '../../features/calculators/usePersistedFields';
import { colors, fonts, spacing, typography } from '../../theme';

interface Fields {
  rows: YarnFeedRowFields[];
}

const INITIAL: Fields = { rows: [{ ...EMPTY_FEED_ROW }, { ...EMPTY_FEED_ROW, system: 'denye' }] };

export function YarnRatioCalculator() {
  const [f, update] = usePersistedFields('yarn_ratio', INITIAL);

  const percents = useMemo(() => yarnUsageRatios(toFeedRows(f.rows)), [f.rows]);
  const usable = percents.filter((p) => p > 0).length;

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.hint}>
          Kumaşa giren her iplik için 50 iğnedeki iplik uzunluğunu, numarasını ve kaç sistemden beslendiğini girin.
          Örneğin pamuk ve likralı bir kumaşta iki iplik doldurun.
        </Text>

        <CalcTable title="İplik oranı">
          <CalcSectionRow label="İplikler" />
          <YarnFeedRowsEditor rows={f.rows} onChange={(rows) => update({ rows })} />
          <CalcSectionRow label="Kumaştaki pay" />
          {f.rows.map((_, index) => (
            <CalcResultRow
              key={index}
              label={`${index + 1}. iplik payı`}
              value={percents[index] > 0 ? `%${formatNumber(percents[index], 1)}` : '—'}
            />
          ))}
          {usable === 0 ? (
            <CalcNoteRow text="Hesap için her iplikte uzunluk, numara ve sistem sayısı dolu olmalı." />
          ) : null}
          <CalcFormulaRow text="Her iplik için bir devirde örülen gram = sistem sayısı × ilmek boyu (50 iğne cm ÷ 5) × Tex. Paylar bu gramların toplamına bölünür." />
        </CalcTable>
        <CalcClearButton onClear={() => update(INITIAL)} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
  hint: { ...typography.caption, fontFamily: fonts.regular, color: colors.textMuted, marginBottom: spacing.sm },
});
