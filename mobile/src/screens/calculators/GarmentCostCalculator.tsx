import React, { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextField } from '../../components/TextField';
import { ResultCard } from '../../components/ResultCard';
import { calculateGarmentCost } from '../../features/calculators/formulas';
import { parseNumber, formatNumber } from '../../features/calculators/parse';
import { usePersistedFields } from '../../features/calculators/usePersistedFields';
import { colors, spacing } from '../../theme';

interface Fields {
  consumption: string;
  fabricPrice: string;
  wastage: string;
  labor: string;
  accessory: string;
}

const INITIAL: Fields = { consumption: '', fabricPrice: '', wastage: '0', labor: '', accessory: '' };

export function GarmentCostCalculator() {
  const [fields, update] = usePersistedFields('garment_cost', INITIAL);
  const { consumption, fabricPrice, wastage, labor, accessory } = fields;

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
        <TextField label="Kumaş Tüketimi (metre/adet)" keyboardType="numeric" value={consumption} onChangeText={(v) => update({ consumption: v })} placeholder="Örn. 1.4" />
        <TextField label="Kumaş Birim Fiyatı (₺/metre)" keyboardType="numeric" value={fabricPrice} onChangeText={(v) => update({ fabricPrice: v })} placeholder="Örn. 45" />
        <TextField label="Fire Oranı (%)" keyboardType="numeric" value={wastage} onChangeText={(v) => update({ wastage: v })} placeholder="Örn. 8" />
        <TextField label="İşçilik (₺/adet)" keyboardType="numeric" value={labor} onChangeText={(v) => update({ labor: v })} placeholder="Örn. 35" />
        <TextField label="Aksesuar (₺/adet)" keyboardType="numeric" value={accessory} onChangeText={(v) => update({ accessory: v })} placeholder="Örn. 10" />

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
