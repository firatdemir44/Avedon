import React, { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CalcTable,
  CalcInputRow,
  CalcResultRow,
  CalcNoteRow,
  CalcFormulaRow,
  CalcClearButton,
} from '../../components/CalcTable';
import { calculateYarnUsageKg } from '../../features/calculators/formulas';
import { parseNumber, formatNumber } from '../../features/calculators/parse';
import { usePersistedFields } from '../../features/calculators/usePersistedFields';
import { colors, spacing } from '../../theme';

interface Fields {
  length: string;
  weightGsm: string;
  widthCm: string;
  wastage: string;
}

const INITIAL: Fields = { length: '', weightGsm: '', widthCm: '', wastage: '0' };

export function YarnUsageCalculator() {
  const [fields, update] = usePersistedFields('yarn_usage', INITIAL);
  const { length, weightGsm, widthCm, wastage } = fields;

  const result = useMemo(() => {
    if (!length || !weightGsm || !widthCm) return null;
    return calculateYarnUsageKg({
      fabricLengthMeters: parseNumber(length),
      weightGsm: parseNumber(weightGsm),
      widthCm: parseNumber(widthCm),
      wastagePercent: parseNumber(wastage),
    });
  }, [length, weightGsm, widthCm, wastage]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <CalcTable title="İplik ihtiyacı">
          <CalcInputRow
            label="Üretilecek kumaş uzunluğu"
            value={length}
            onChangeText={(v) => update({ length: v })}
            placeholder="500"
            unit="metre"
          />
          <CalcInputRow
            label="Kumaş gramajı"
            value={weightGsm}
            onChangeText={(v) => update({ weightGsm: v })}
            placeholder="200"
            unit="gr/m²"
          />
          <CalcInputRow
            label="En"
            value={widthCm}
            onChangeText={(v) => update({ widthCm: v })}
            placeholder="160"
            unit="cm"
          />
          <CalcInputRow
            label="Fire oranı"
            value={wastage}
            onChangeText={(v) => update({ wastage: v })}
            placeholder="5"
            unit="%"
          />
          <CalcResultRow
            label="Gerekli iplik miktarı"
            value={result !== null ? formatNumber(result) : '—'}
            unit="kg"
            emphasis="primary"
          />
          {result === null ? (
            <CalcNoteRow text="Hesap için uzunluk, gramaj ve en girin." />
          ) : null}
          <CalcFormulaRow text="İplik (kg) = uzunluk × en (m) × gramaj ÷ 1000 × (1 + fire ÷ 100)" />
        </CalcTable>
        <CalcClearButton onClear={() => update(INITIAL)} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
});
