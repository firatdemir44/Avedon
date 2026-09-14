import React, { useMemo } from 'react';
import { Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextField } from '../../components/TextField';
import { ResultCard } from '../../components/ResultCard';
import {
  EMPTY_FEED_ROW,
  YarnFeedRowsEditor,
  toFeedRows,
  type YarnFeedRowFields,
} from '../../components/YarnFeedRowsEditor';
import { calculateKnitProduction } from '../../features/calculators/formulas';
import { parseNumber, formatNumber } from '../../features/calculators/parse';
import { usePersistedFields } from '../../features/calculators/usePersistedFields';
import { colors, spacing, typography } from '../../theme';

interface Fields {
  rows: YarnFeedRowFields[];
  needles: string;
  rpm: string;
  efficiency: string;
  hoursPerDay: string;
  fee: string;
}

const INITIAL: Fields = {
  rows: [{ ...EMPTY_FEED_ROW }],
  needles: '',
  rpm: '',
  efficiency: '90',
  hoursPerDay: '24',
  fee: '',
};

// Eski "hız × saat" sürümünün kayıtlarıyla karışmasın diye yeni anahtar.
export function ProductionCalculator() {
  const [f, update] = usePersistedFields('knit_production', INITIAL);

  const result = useMemo(() => {
    const needles = parseNumber(f.needles);
    const rpm = parseNumber(f.rpm);
    if (needles <= 0 || rpm <= 0) return null;
    const r = calculateKnitProduction({
      rows: toFeedRows(f.rows),
      needles,
      rpm,
      efficiencyPercent: parseNumber(f.efficiency),
      hoursPerDay: parseNumber(f.hoursPerDay),
      knittingFeePerKg: parseNumber(f.fee),
    });
    return r.kgPerHour > 0 ? r : null;
  }, [f.rows, f.needles, f.rpm, f.efficiency, f.hoursPerDay, f.fee]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.hint}>
          Makinede örülen her iplik için 50 iğnedeki uzunluğu, numarasını ve sistem sayısını girin; ardından makine bilgilerini doldurun.
        </Text>

        <YarnFeedRowsEditor rows={f.rows} onChange={(rows) => update({ rows })} percents={result?.percents} />

        <Text style={styles.section}>Makine</Text>
        <TextField label="İğne sayısı" keyboardType="number-pad" value={f.needles} onChangeText={(v) => update({ needles: v })} placeholder="Örn. 2568" />
        <Text style={styles.hint}>Bilmiyorsanız: çap (inç) × incelik (E) × 3,14. Örneğin 30 inç, 28 E makinede yaklaşık 2640 iğne.</Text>
        <TextField label="Makine devri (devir/dk)" keyboardType="decimal-pad" value={f.rpm} onChangeText={(v) => update({ rpm: v })} placeholder="Örn. 25" />
        <TextField label="Randıman (%)" keyboardType="decimal-pad" value={f.efficiency} onChangeText={(v) => update({ efficiency: v })} placeholder="Örn. 90" />
        <TextField label="Günlük çalışma (saat)" keyboardType="decimal-pad" value={f.hoursPerDay} onChangeText={(v) => update({ hoursPerDay: v })} placeholder="Örn. 24" />
        <TextField label="Fason ücreti (₺/kg, isteğe bağlı)" keyboardType="decimal-pad" value={f.fee} onChangeText={(v) => update({ fee: v })} placeholder="Örn. 65" />

        {result ? (
          <ResultCard
            rows={[
              { label: 'Saatlik üretim', value: `${formatNumber(result.kgPerHour, 1)} kg` },
              { label: 'Günlük üretim', value: `${formatNumber(result.kgPerDay, 0)} kg` },
              ...(result.dailyFeeIncome !== null
                ? [{ label: 'Günlük fason geliri', value: `${formatNumber(result.dailyFeeIncome, 0)} ₺` }]
                : []),
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
  hint: { ...typography.label, fontWeight: '400', color: colors.textMuted, marginBottom: spacing.md },
  section: { ...typography.heading, color: colors.primary, marginBottom: spacing.sm },
});
