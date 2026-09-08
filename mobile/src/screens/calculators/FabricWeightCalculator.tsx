import React, { useMemo } from 'react';
import { Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextField } from '../../components/TextField';
import { ResultCard } from '../../components/ResultCard';
import { calculateFabricWeightGsm } from '../../features/calculators/formulas';
import { parseNumber, formatNumber } from '../../features/calculators/parse';
import { usePersistedFields } from '../../features/calculators/usePersistedFields';
import { colors, spacing } from '../../theme';

interface Fields {
  tex: string;
  loopLength: string;
  kFactor: string;
}

const INITIAL: Fields = { tex: '', loopLength: '', kFactor: '' };

export function FabricWeightCalculator() {
  const [fields, update] = usePersistedFields('fabric_weight', INITIAL);
  const { tex, loopLength, kFactor } = fields;

  const result = useMemo(() => {
    if (!tex || !loopLength || !kFactor) return null;
    return calculateFabricWeightGsm({
      yarnTex: parseNumber(tex),
      loopLengthMm: parseNumber(loopLength),
      kFactor: parseNumber(kFactor),
    });
  }, [tex, loopLength, kFactor]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>
          Formül: Gramaj (gr/m²) = (K faktörü × İplik Tex) / İlmek Boyu (mm). K faktörü örgü tipine (single jersey, rib, interlok vb.) ve makineye göre değişir — kendi değerinizi girin, sistem tahmin üretmez.
        </Text>
        <TextField label="İplik Numarası (Tex)" keyboardType="numeric" value={tex} onChangeText={(v) => update({ tex: v })} placeholder="Örn. 20" />
        <TextField label="İlmek Boyu (mm)" keyboardType="numeric" value={loopLength} onChangeText={(v) => update({ loopLength: v })} placeholder="Örn. 3.2" />
        <TextField label="K Faktörü" keyboardType="numeric" value={kFactor} onChangeText={(v) => update({ kFactor: v })} placeholder="Örn. 13.3" />

        {result !== null ? (
          <ResultCard rows={[{ label: 'Kumaş Gramajı', value: `${formatNumber(result)} gr/m²` }]} />
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
