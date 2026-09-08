import React, { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextField } from '../../components/TextField';
import { ResultCard } from '../../components/ResultCard';
import { calculateFabricCost } from '../../features/calculators/formulas';
import { parseNumber, formatNumber } from '../../features/calculators/parse';
import { usePersistedFields } from '../../features/calculators/usePersistedFields';
import { colors, spacing } from '../../theme';

interface Fields {
  yarnPrice: string;
  weightGsm: string;
  widthCm: string;
  wastage: string;
  finishingCost: string;
}

const INITIAL: Fields = { yarnPrice: '', weightGsm: '', widthCm: '', wastage: '0', finishingCost: '0' };

export function FabricCostCalculator() {
  const [fields, update] = usePersistedFields('fabric_cost', INITIAL);
  const { yarnPrice, weightGsm, widthCm, wastage, finishingCost } = fields;

  const result = useMemo(() => {
    if (!yarnPrice || !weightGsm || !widthCm) return null;
    return calculateFabricCost({
      yarnPricePerKg: parseNumber(yarnPrice),
      weightGsm: parseNumber(weightGsm),
      widthCm: parseNumber(widthCm),
      wastagePercent: parseNumber(wastage),
      finishingCostPerKg: parseNumber(finishingCost),
    });
  }, [yarnPrice, weightGsm, widthCm, wastage, finishingCost]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <TextField label="İplik / Hammadde Fiyatı (₺/kg)" keyboardType="numeric" value={yarnPrice} onChangeText={(v) => update({ yarnPrice: v })} placeholder="Örn. 180" />
        <TextField label="Kumaş Gramajı (gr/m²)" keyboardType="numeric" value={weightGsm} onChangeText={(v) => update({ weightGsm: v })} placeholder="Örn. 200" />
        <TextField label="En (cm)" keyboardType="numeric" value={widthCm} onChangeText={(v) => update({ widthCm: v })} placeholder="Örn. 160" />
        <TextField label="Fire Oranı (%)" keyboardType="numeric" value={wastage} onChangeText={(v) => update({ wastage: v })} placeholder="Örn. 5" />
        <TextField label="Boyama / Terbiye Maliyeti (₺/kg)" keyboardType="numeric" value={finishingCost} onChangeText={(v) => update({ finishingCost: v })} placeholder="Örn. 20" />

        {result ? (
          <ResultCard
            rows={[
              { label: '1 Metre Kumaş Ağırlığı', value: `${formatNumber(result.weightPerMeterKg, 3)} kg` },
              { label: 'Maliyet (₺/metre)', value: `${formatNumber(result.costPerMeter)} ₺` },
              { label: 'Maliyet (₺/kg)', value: `${formatNumber(result.costPerKg)} ₺` },
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
});
