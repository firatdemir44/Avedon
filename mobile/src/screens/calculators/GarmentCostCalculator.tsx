import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextField } from '../../components/TextField';
import { ResultCard } from '../../components/ResultCard';
import { calculateGarmentCost } from '../../features/calculators/formulas';
import { parseNumber, formatNumber } from '../../features/calculators/parse';
import { colors, spacing } from '../../theme';

export function GarmentCostCalculator() {
  const [consumption, setConsumption] = useState('');
  const [fabricPrice, setFabricPrice] = useState('');
  const [wastage, setWastage] = useState('0');
  const [labor, setLabor] = useState('');
  const [accessory, setAccessory] = useState('');

  const result = useMemo(() => {
    if (!consumption || !fabricPrice) return null;
    return calculateGarmentCost({
      fabricConsumptionMeters: parseNumber(consumption),
      fabricPricePerMeter: parseNumber(fabricPrice),
      wastagePercent: parseNumber(wastage),
      laborCost: parseNumber(labor),
      accessoryCost: parseNumber(accessory),
    });
  }, [consumption, fabricPrice, wastage, labor, accessory]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <TextField label="Kumaş Tüketimi (metre/adet)" keyboardType="numeric" value={consumption} onChangeText={setConsumption} placeholder="Örn. 1.4" />
        <TextField label="Kumaş Birim Fiyatı (₺/metre)" keyboardType="numeric" value={fabricPrice} onChangeText={setFabricPrice} placeholder="Örn. 45" />
        <TextField label="Fire Oranı (%)" keyboardType="numeric" value={wastage} onChangeText={setWastage} placeholder="Örn. 8" />
        <TextField label="İşçilik (₺/adet)" keyboardType="numeric" value={labor} onChangeText={setLabor} placeholder="Örn. 35" />
        <TextField label="Aksesuar (₺/adet)" keyboardType="numeric" value={accessory} onChangeText={setAccessory} placeholder="Örn. 10" />

        {result ? (
          <ResultCard
            rows={[
              { label: 'Kumaş Maliyeti', value: `${formatNumber(result.fabricCost)} ₺` },
              { label: 'Toplam Ürün Maliyeti', value: `${formatNumber(result.totalCost)} ₺` },
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
