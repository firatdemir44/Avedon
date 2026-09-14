import React, { useMemo } from 'react';
import { Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResultCard } from '../../components/ResultCard';
import {
  EMPTY_FEED_ROW,
  YarnFeedRowsEditor,
  toFeedRows,
  type YarnFeedRowFields,
} from '../../components/YarnFeedRowsEditor';
import { yarnUsageRatios } from '../../features/calculators/formulas';
import { formatNumber } from '../../features/calculators/parse';
import { usePersistedFields } from '../../features/calculators/usePersistedFields';
import { colors, spacing, typography } from '../../theme';

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
          Kumaşa giren her iplik için 50 iğnedeki iplik uzunluğunu, numarasını ve kaç sistemden beslendiğini girin. Örneğin pamuk ve likralı bir kumaşta iki iplik doldurun.
        </Text>

        <YarnFeedRowsEditor rows={f.rows} onChange={(rows) => update({ rows })} percents={percents} />

        {usable > 0 ? (
          <ResultCard
            rows={percents
              .map((percent, index) => ({ percent, index }))
              .filter(({ percent }) => percent > 0)
              .map(({ percent, index }) => ({
                label: `${index + 1}. iplik payı`,
                value: `%${formatNumber(percent, 1)}`,
              }))}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  hint: { ...typography.label, fontWeight: '400', color: colors.textMuted, marginBottom: spacing.md },
});
