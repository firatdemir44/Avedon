import React, { useMemo } from 'react';
import { Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextField } from '../../components/TextField';
import { ResultCard } from '../../components/ResultCard';
import { ChipSelect } from '../../components/ChipSelect';
import { FEED_SYSTEM_OPTIONS } from '../../components/YarnFeedRowsEditor';
import {
  gsmFromKnitStructure,
  gsmFromSample,
  loopLengthMmFrom50Needles,
  toTex,
  type YarnCountSystem,
} from '../../features/calculators/formulas';
import { parseNumber, formatNumber } from '../../features/calculators/parse';
import { usePersistedFields } from '../../features/calculators/usePersistedFields';
import { colors, spacing, typography } from '../../theme';

type Mode = 'sample' | 'structure';

interface Fields {
  mode: Mode;
  widthMm: string;
  lengthMm: string;
  weightGrams: string;
  coursesPerCm: string;
  walesPerCm: string;
  length50: string;
  count: string;
  system: YarnCountSystem;
  plate: 'single' | 'double';
}

const INITIAL: Fields = {
  mode: 'sample',
  widthMm: '',
  lengthMm: '',
  weightGrams: '',
  coursesPerCm: '',
  walesPerCm: '',
  length50: '',
  count: '',
  system: 'ne',
  plate: 'single',
};

const positive = (v: string) => parseNumber(v) > 0;

// Eski K faktörlü sürümün kayıtlarıyla karışmasın diye yeni saklama anahtarı.
export function FabricWeightCalculator() {
  const [f, update] = usePersistedFields('fabric_weight_v2', INITIAL);

  const sampleGsm = useMemo(() => {
    if (!positive(f.widthMm) || !positive(f.lengthMm) || !positive(f.weightGrams)) return null;
    return gsmFromSample(parseNumber(f.widthMm), parseNumber(f.lengthMm), parseNumber(f.weightGrams));
  }, [f.widthMm, f.lengthMm, f.weightGrams]);

  const structure = useMemo(() => {
    if (![f.coursesPerCm, f.walesPerCm, f.length50, f.count].every(positive)) return null;
    const loopLengthMm = loopLengthMmFrom50Needles(parseNumber(f.length50));
    const yarnTex = toTex(parseNumber(f.count), f.system);
    const gsm = gsmFromKnitStructure({
      coursesPerCm: parseNumber(f.coursesPerCm),
      walesPerCm: parseNumber(f.walesPerCm),
      loopLengthMm,
      yarnTex,
      doubleJersey: f.plate === 'double',
    });
    return { gsm, loopLengthMm, yarnTex };
  }, [f.coursesPerCm, f.walesPerCm, f.length50, f.count, f.system, f.plate]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ChipSelect
          options={[
            { value: 'sample', label: 'Numuneden' },
            { value: 'structure', label: 'Örgüden tahmin' },
          ]}
          value={f.mode}
          onChange={(mode) => update({ mode })}
        />

        {f.mode === 'sample' ? (
          <>
            <Text style={styles.hint}>
              Kumaştan bir parça kesin; enini, boyunu milimetre olarak ölçüp tartın. Kesin sonuç bu yöntemle alınır.
            </Text>
            <TextField label="Kumaş eni (mm)" keyboardType="decimal-pad" value={f.widthMm} onChangeText={(v) => update({ widthMm: v })} placeholder="Örn. 40" />
            <TextField label="Kumaş boyu (mm)" keyboardType="decimal-pad" value={f.lengthMm} onChangeText={(v) => update({ lengthMm: v })} placeholder="Örn. 50" />
            <TextField label="Kumaş ağırlığı (gr)" keyboardType="decimal-pad" value={f.weightGrams} onChangeText={(v) => update({ weightGrams: v })} placeholder="Örn. 0,55" />
            {sampleGsm !== null ? (
              <ResultCard rows={[{ label: 'Kumaş gramajı', value: `${formatNumber(sampleGsm, 1)} gr/m²` }]} />
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.hint}>
              Kumaşta 1 cm'deki sıra ve çubuk sayısını sayın, 50 iğnedeki iplik uzunluğunu makineden alın. Sonuç tahminidir; kesin değer için numuneden ölçün.
            </Text>
            <TextField label="Sıra sayısı (sıra/cm)" keyboardType="decimal-pad" value={f.coursesPerCm} onChangeText={(v) => update({ coursesPerCm: v })} placeholder="Örn. 20" />
            <TextField label="Çubuk sayısı (çubuk/cm)" keyboardType="decimal-pad" value={f.walesPerCm} onChangeText={(v) => update({ walesPerCm: v })} placeholder="Örn. 15" />
            <TextField label="50 iğne iplik uzunluğu (cm)" keyboardType="decimal-pad" value={f.length50} onChangeText={(v) => update({ length50: v })} placeholder="Örn. 14" />
            <TextField label="İplik numarası" keyboardType="decimal-pad" value={f.count} onChangeText={(v) => update({ count: v })} placeholder="Örn. 30" />
            <ChipSelect compact options={FEED_SYSTEM_OPTIONS} value={f.system} onChange={(system) => update({ system })} />
            <Text style={styles.label}>Örgü</Text>
            <ChipSelect
              options={[
                { value: 'single', label: 'Tek plaka' },
                { value: 'double', label: 'Çift plaka' },
              ]}
              value={f.plate}
              onChange={(plate) => update({ plate })}
            />
            {structure ? (
              <ResultCard
                rows={[
                  { label: 'Tahmini gramaj', value: `${formatNumber(structure.gsm, 1)} gr/m²` },
                  { label: 'İlmek boyu', value: `${formatNumber(structure.loopLengthMm, 2)} mm` },
                  { label: 'İplik', value: `${formatNumber(structure.yarnTex, 1)} Tex` },
                ]}
              />
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  hint: { ...typography.label, fontWeight: '400', color: colors.textMuted, marginBottom: spacing.md },
  label: { ...typography.label, color: colors.text, marginBottom: spacing.xs },
});
