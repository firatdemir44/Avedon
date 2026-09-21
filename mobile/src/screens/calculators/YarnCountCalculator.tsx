import React, { useMemo } from 'react';
import { Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChipSelect } from '../../components/ChipSelect';
import {
  CalcTable,
  CalcSectionRow,
  CalcInputRow,
  CalcResultRow,
  CalcNoteRow,
  CalcFormulaRow,
  CalcClearButton,
} from '../../components/CalcTable';
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

// Sonuç satırları: sistem adı solda, değer sağda (hesaplanamıyorsa "—").
function resultRows(r: YarnCountResult | null) {
  const v = (get: (x: YarnCountResult) => number, digits: number) => (r ? formatNumber(get(r), digits) : '—');
  return [
    { label: 'Ne (İngiliz pamuk)', value: v((x) => x.ne, 1) },
    { label: 'Nm (Metrik)', value: v((x) => x.nm, 1) },
    { label: 'Tex', value: v((x) => x.tex, 1) },
    { label: 'dtex', value: v((x) => x.dtex, 0) },
    { label: 'Denye', value: v((x) => x.denye, 0) },
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
            <CalcTable title="İplik numarası çevirisi">
              <CalcInputRow
                label="İplik numarası"
                value={f.value}
                onChangeText={(v) => update({ value: v })}
                placeholder="30"
                unit={SYSTEMS.find((s) => s.value === f.system)?.label}
              />
              <CalcInputRow
                label="Kat sayısı"
                hint="Tek kat için 1; 60/2 Ne'de 60 ve 2 yazın."
                value={f.ply}
                onChangeText={(v) => update({ ply: v })}
                placeholder="1"
                keyboardType="number-pad"
                unit="kat"
              />
              <CalcSectionRow label="Karşılıkları" />
              {resultRows(converted).map((row) => (
                <CalcResultRow key={row.label} label={row.label} value={row.value} />
              ))}
              {converted === null ? <CalcNoteRow text="Hesap için iplik numarasını girin." /> : null}
              <CalcFormulaRow text="Önce Tex'e çevrilir (Ne → 1000 ÷ (Ne × 1,693)), kat sayısıyla çarpılır, sonra diğer sistemlere dönüştürülür: Nm = 1000 ÷ Tex, dtex = Tex × 10, Denye = Tex × 9." />
            </CalcTable>
          </>
        ) : (
          <>
            <Text style={styles.hint}>
              İplikten bir parça kesip uzunluğunu ölçün ve hassas terazide tartın. Uzun parça ölçmek sonucu daha
              güvenilir yapar.
            </Text>
            <CalcTable title="Numuneden iplik numarası">
              <CalcInputRow
                label="İplik uzunluğu"
                value={f.lengthCm}
                onChangeText={(v) => update({ lengthCm: v })}
                placeholder="100"
                unit="cm"
              />
              <CalcInputRow
                label="İplik ağırlığı"
                value={f.weightGrams}
                onChangeText={(v) => update({ weightGrams: v })}
                placeholder="0,02"
                unit="gr"
              />
              <CalcSectionRow label="Karşılıkları" />
              {resultRows(fromSample).map((row) => (
                <CalcResultRow key={row.label} label={row.label} value={row.value} />
              ))}
              {fromSample === null ? <CalcNoteRow text="Hesap için uzunluk ve ağırlığı girin." /> : null}
              <CalcFormulaRow text="Tex = ağırlık (gr) × 100.000 ÷ uzunluk (cm); 1.000 metrenin gram ağırlığıdır." />
            </CalcTable>
          </>
        )}
        <CalcClearButton onClear={() => update({ ...INITIAL, mode: f.mode })} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
  label: { ...typography.label, color: colors.text, marginBottom: spacing.xs },
  hint: { ...typography.caption, fontFamily: fonts.regular, color: colors.textMuted, marginBottom: spacing.sm },
});
