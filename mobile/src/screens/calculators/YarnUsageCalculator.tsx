import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextField } from '../../components/TextField';
import { ResultCard } from '../../components/ResultCard';
import { calculateYarnUsageKg } from '../../features/calculators/formulas';
import { parseNumber, formatNumber } from '../../features/calculators/parse';
import { colors, spacing } from '../../theme';

export function YarnUsageCalculator() {
  const [length, setLength] = useState('');
  const [weightGsm, setWeightGsm] = useState('');
  const [widthCm, setWidthCm] = useState('');
  const [wastage, setWastage] = useState('0');

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
      <ScrollView contentContainerStyle={styles.content}>
        <TextField label="Üretilecek Kumaş Uzunluğu (metre)" keyboardType="numeric" value={length} onChangeText={setLength} placeholder="Örn. 500" />
        <TextField label="Kumaş Gramajı (gr/m²)" keyboardType="numeric" value={weightGsm} onChangeText={setWeightGsm} placeholder="Örn. 200" />
        <TextField label="En (cm)" keyboardType="numeric" value={widthCm} onChangeText={setWidthCm} placeholder="Örn. 160" />
        <TextField label="Fire Oranı (%)" keyboardType="numeric" value={wastage} onChangeText={setWastage} placeholder="Örn. 5" />

        {result !== null ? (
          <ResultCard rows={[{ label: 'Gerekli İplik Miktarı', value: `${formatNumber(result)} kg` }]} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
});
