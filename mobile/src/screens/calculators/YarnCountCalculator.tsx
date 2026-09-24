import React, { useLayoutEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { tr } from '../../i18n';
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
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Chip, ChipRow, Screen, SegmentControl } from '../../ui';

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

export function YarnCountCalculator({ navigation }: RootStackScreenProps<'YarnCountCalculator'>) {
  const t = useTheme();
  const [f, update] = usePersistedFields('yarn_count_v2', INITIAL);

  // Kendi üst bandımızı (AppBar) çiziyoruz; yığının başlığı kapanıyor.
  useLayoutEffect(() => navigation.setOptions({ headerShown: false }), [navigation]);

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
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title={tr('İplik numarası')} leading="back" onBack={() => navigation.goBack()} />
      <Screen>
        <SegmentControl
          stretch
          accessibilityLabel={tr('Hesap yöntemi')}
          options={[
            { value: 'convert', label: tr('Sistem çevir') },
            { value: 'sample', label: tr('Numuneden hesapla') },
          ]}
          value={f.mode}
          onChange={(mode) => update({ mode })}
        />

        {f.mode === 'convert' ? (
          <>
            {/* Beş sistem 375 px'te tek satıra sığmaz; çip satırı yatay kaydırılır. */}
            <View style={{ gap: t.space[2] }}>
              <Text style={[t.type.label14, { color: t.colors.ink2 }]}>{tr('Numaralandırma sistemi')}</Text>
              <ChipRow>
                {SYSTEMS.map((s) => (
                  <Chip
                    key={s.value}
                    label={tr(s.label)}
                    selected={s.value === f.system}
                    onPress={() => update({ system: s.value })}
                  />
                ))}
              </ChipRow>
            </View>
            <CalcTable title={tr('İplik numarası çevirisi')}>
              <CalcInputRow
                label={tr('İplik numarası')}
                value={f.value}
                onChangeText={(v) => update({ value: v })}
                placeholder="30"
                unit={tr(SYSTEMS.find((s) => s.value === f.system)?.label ?? '')}
              />
              <CalcInputRow
                label={tr('Kat sayısı')}
                hint={tr("Tek kat için 1; 60/2 Ne'de 60 ve 2 yazın.")}
                value={f.ply}
                onChangeText={(v) => update({ ply: v })}
                placeholder="1"
                keyboardType="number-pad"
                unit={tr('kat')}
              />
              <CalcSectionRow label={tr('Karşılıkları')} />
              {resultRows(converted).map((row) => (
                <CalcResultRow key={row.label} label={tr(row.label)} value={row.value} />
              ))}
              {converted === null ? <CalcNoteRow text={tr('Hesap için iplik numarasını girin.')} /> : null}
              <CalcFormulaRow text={tr("Önce Tex'e çevrilir (Ne → 1000 ÷ (Ne × 1,693)), kat sayısıyla çarpılır, sonra diğer sistemlere dönüştürülür: Nm = 1000 ÷ Tex, dtex = Tex × 10, Denye = Tex × 9.")} />
            </CalcTable>
          </>
        ) : (
          <>
            <Text style={[t.type.body14, { color: t.colors.ink3 }]}>
              {tr('İplikten bir parça kesip uzunluğunu ölçün ve hassas terazide tartın. Uzun parça ölçmek sonucu daha güvenilir yapar.')}
            </Text>
            <CalcTable title={tr('Numuneden iplik numarası')}>
              <CalcInputRow
                label={tr('İplik uzunluğu')}
                value={f.lengthCm}
                onChangeText={(v) => update({ lengthCm: v })}
                placeholder="100"
                unit="cm"
              />
              <CalcInputRow
                label={tr('İplik ağırlığı')}
                value={f.weightGrams}
                onChangeText={(v) => update({ weightGrams: v })}
                placeholder="0,02"
                unit="gr"
              />
              <CalcSectionRow label={tr('Karşılıkları')} />
              {resultRows(fromSample).map((row) => (
                <CalcResultRow key={row.label} label={tr(row.label)} value={row.value} />
              ))}
              {fromSample === null ? <CalcNoteRow text={tr('Hesap için uzunluk ve ağırlığı girin.')} /> : null}
              <CalcFormulaRow text={tr('Tex = ağırlık (gr) × 100.000 ÷ uzunluk (cm); 1.000 metrenin gram ağırlığıdır.')} />
            </CalcTable>
          </>
        )}
        <CalcClearButton onClear={() => update({ ...INITIAL, mode: f.mode })} />
      </Screen>
    </View>
  );
}
