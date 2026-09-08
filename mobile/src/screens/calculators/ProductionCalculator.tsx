import React, { useMemo, useState } from 'react';
import { Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextField } from '../../components/TextField';
import { ResultCard } from '../../components/ResultCard';
import { calculateDailyProduction } from '../../features/calculators/formulas';
import { parseNumber, formatNumber } from '../../features/calculators/parse';
import { colors, spacing } from '../../theme';

export function ProductionCalculator() {
  const [speed, setSpeed] = useState('');
  const [shiftHours, setShiftHours] = useState('8');
  const [shiftsPerDay, setShiftsPerDay] = useState('1');
  const [efficiency, setEfficiency] = useState('85');

  const result = useMemo(() => {
    if (!speed) return null;
    return calculateDailyProduction({
      speedPerMinute: parseNumber(speed),
      shiftHours: parseNumber(shiftHours),
      shiftsPerDay: parseNumber(shiftsPerDay),
      efficiencyPercent: parseNumber(efficiency),
    });
  }, [speed, shiftHours, shiftsPerDay, efficiency]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>Makine hızını hangi birimde girerseniz (m/dk, kg/dk vb.), sonuç da o birimde günlük toplam olarak hesaplanır.</Text>
        <TextField label="Makine Hızı (birim/dakika)" keyboardType="numeric" value={speed} onChangeText={setSpeed} placeholder="Örn. 25" />
        <TextField label="Vardiya Süresi (saat)" keyboardType="numeric" value={shiftHours} onChangeText={setShiftHours} placeholder="Örn. 8" />
        <TextField label="Günlük Vardiya Sayısı" keyboardType="numeric" value={shiftsPerDay} onChangeText={setShiftsPerDay} placeholder="Örn. 2" />
        <TextField label="Verimlilik (%)" keyboardType="numeric" value={efficiency} onChangeText={setEfficiency} placeholder="Örn. 85" />

        {result !== null ? (
          <ResultCard rows={[{ label: 'Günlük Üretim Kapasitesi', value: formatNumber(result) }]} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
});
