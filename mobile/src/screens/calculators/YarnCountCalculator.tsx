import React, { useMemo } from 'react';
import { Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextField } from '../../components/TextField';
import { ResultCard } from '../../components/ResultCard';
import { ChipSelect } from '../../components/ChipSelect';
import {
  convertYarnCount,
  yarnCountFromSample,
  type YarnCountResult,
  type YarnCountSystem,
} from '../../features/calculators/formulas';
import { parseNumber, formatNumber } from '../../features/calculators/parse';
import { usePersistedFields } from '../../features/calculators/usePersistedFields';
import { colors, fonts, spacing, typography } from '../../theme';

type Mode = 'convert' | 'sample';

interface Fields {
  mode: Mode;
  value: string;
  system: YarnCountSystem;
  ply: string;
  lengthCm: string;
  weightGrams: string;
}

const INITIAL: Fields = { mode: 'convert', value: '', system: 'ne', ply: '1', lengthCm: '', weightGrams: '' };

const SYSTEMS: { value: YarnCountSystem; label: string }[] = [
  { value: 'ne', label: 'Ne' },
  { value: 'nm', label: 'Nm' },
  { value: 'tex', label: 'Tex' },
  { value: 'dtex', label: 'dtex' },
  { value: 'denye', label: 'Denye' },
];

function resultRows(r: YarnCountResult) {
  return [
    { label: 'Ne (İngiliz pamuk)', value: formatNumber(r.ne, 1) },
    { label: 'Nm (Metrik)', value: formatNumber(r.nm, 1) },
    { label: 'Tex', value: formatNumber(r.tex, 1) },
    { label: 'dtex', value: formatNumber(r.dtex, 0) },
    { label: 'Denye', value: formatNumber(r.denye, 0) },
  ];
}

export function YarnCountCalculator() {
  const [f, update] = usePersistedFields('yarn_count_v2', INITIAL);

  const converted = useMemo(() => {
    const value = parseNumber(f.value);
    if (value <= 0) return null;
    return convertYarnCount(value, f.system, Math.max(1, Math.round(parseNumber(f.ply) || 1)));
  }, [f.value, f.system, f.ply]);

  const fromSample = useMemo(() => {
    const length = parseNumber(f.lengthCm);
    const weight = parseNumber(f.weightGrams);
    if (length <= 0 || weight <= 0) return null;
    return yarnCountFromSample(length, weight);
  }, [f.lengthCm, f.weightGrams]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ChipSelect
          options={[
            { value: 'convert', label: 'Sistem çevir' },
            { value: 'sample', label: 'Numuneden hesapla' },
          ]}
          value={f.mode}
          onChange={(mode) => update({ mode })}
        />

        {f.mode === 'convert' ? (
          <>
            <Text style={styles.label}>Numaralandırma sistemi</Text>
            <ChipSelect options={SYSTEMS} value={f.system} onChange={(system) => update({ system })} />
            <TextField label="İplik numarası" keyboardType="decimal-pad" value={f.value} onChangeText={(v) => update({ value: v })} placeholder="Örn. 30" />
            <TextField label="Kat sayısı" keyboardType="number-pad" value={f.ply} onChangeText={(v) => update({ ply: v })} placeholder="1" />
            <Text style={styles.hint}>Tek kat iplik için 1 bırakın. 60/2 Ne gibi katlı iplikte numaraya 60, kat sayısına 2 yazın.</Text>
            {converted ? <ResultCard rows={resultRows(converted)} /> : null}
          </>
        ) : (
          <>
            <Text style={styles.hint}>
              İplikten bir parça kesip uzunluğunu ölçün ve hassas terazide tartın. Uzun parça ölçmek sonucu daha güvenilir yapar.
            </Text>
            <TextField label="İplik uzunluğu (cm)" keyboardType="decimal-pad" value={f.lengthCm} onChangeText={(v) => update({ lengthCm: v })} placeholder="Örn. 100" />
            <TextField label="İplik ağırlığı (gr)" keyboardType="decimal-pad" value={f.weightGrams} onChangeText={(v) => update({ weightGrams: v })} placeholder="Örn. 0,02" />
            {fromSample ? <ResultCard rows={resultRows(fromSample)} /> : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  label: { ...typography.label, color: colors.text, marginBottom: spacing.xs },
  hint: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted, marginBottom: spacing.md },
});
