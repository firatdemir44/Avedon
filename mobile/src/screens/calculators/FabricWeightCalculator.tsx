import React, { useLayoutEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  CalcTable,
  CalcInputRow,
  CalcResultRow,
  CalcNoteRow,
  CalcFormulaRow,
  CalcClearButton,
} from '../../components/CalcTable';
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
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Screen, SegmentControl } from '../../ui';

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
export function FabricWeightCalculator({ navigation }: RootStackScreenProps<'FabricWeightCalculator'>) {
  const t = useTheme();
  const [f, update] = usePersistedFields('fabric_weight_v2', INITIAL);

  // Kendi üst bandımızı (AppBar) çiziyoruz; yığının başlığı kapanıyor.
  useLayoutEffect(() => navigation.setOptions({ headerShown: false }), [navigation]);

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
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title="Kumaş gramajı" leading="back" onBack={() => navigation.goBack()} />
      <Screen>
        <SegmentControl
          stretch
          accessibilityLabel="Hesap yöntemi"
          options={[
            { value: 'sample', label: 'Numuneden' },
            { value: 'structure', label: 'Örgüden tahmin' },
          ]}
          value={f.mode}
          onChange={(mode) => update({ mode })}
        />

        {f.mode === 'sample' ? (
          <>
            <Text style={[t.type.body14, { color: t.colors.ink3 }]}>
              Kumaştan bir parça kesin; enini, boyunu milimetre olarak ölçüp tartın. Kesin sonuç bu yöntemle alınır.
            </Text>
            <CalcTable title="Numuneden gramaj">
              <CalcInputRow
                label="Kumaş eni"
                value={f.widthMm}
                onChangeText={(v) => update({ widthMm: v })}
                placeholder="40"
                unit="mm"
              />
              <CalcInputRow
                label="Kumaş boyu"
                value={f.lengthMm}
                onChangeText={(v) => update({ lengthMm: v })}
                placeholder="50"
                unit="mm"
              />
              <CalcInputRow
                label="Kumaş ağırlığı"
                value={f.weightGrams}
                onChangeText={(v) => update({ weightGrams: v })}
                placeholder="0,55"
                unit="gr"
              />
              <CalcResultRow
                label="Kumaş gramajı"
                value={sampleGsm !== null ? formatNumber(sampleGsm, 1) : '—'}
                unit="gr/m²"
                emphasis="primary"
              />
              {sampleGsm === null ? <CalcNoteRow text="Hesap için en, boy ve ağırlığı girin." /> : null}
              <CalcFormulaRow text="Gramaj = ağırlık (gr) ÷ (en × boy ÷ 1.000.000) (m²)" />
            </CalcTable>
          </>
        ) : (
          <>
            <Text style={[t.type.body14, { color: t.colors.ink3 }]}>
              Kumaşta 1 cm'deki sıra ve çubuk sayısını sayın, 50 iğnedeki iplik uzunluğunu makineden alın. Sonuç
              tahminidir; kesin değer için numuneden ölçün.
            </Text>
            <View style={{ gap: t.space[2] }}>
              <Text style={[t.type.label14, { color: t.colors.ink2 }]}>Örgü</Text>
              <SegmentControl
                stretch
                accessibilityLabel="Örgü"
                options={[
                  { value: 'single', label: 'Tek plaka' },
                  { value: 'double', label: 'Çift plaka' },
                ]}
                value={f.plate}
                onChange={(plate) => update({ plate })}
              />
            </View>
            <CalcTable title="Örgüden tahmini gramaj">
              <CalcInputRow
                label="Sıra sayısı"
                value={f.coursesPerCm}
                onChangeText={(v) => update({ coursesPerCm: v })}
                placeholder="20"
                unit="sıra/cm"
              />
              <CalcInputRow
                label="Çubuk sayısı"
                value={f.walesPerCm}
                onChangeText={(v) => update({ walesPerCm: v })}
                placeholder="15"
                unit="çubuk/cm"
              />
              <CalcInputRow
                label="50 iğne iplik uzunluğu"
                value={f.length50}
                onChangeText={(v) => update({ length50: v })}
                placeholder="14"
                unit="cm"
              />
              <CalcInputRow
                label="İplik numarası"
                value={f.count}
                onChangeText={(v) => update({ count: v })}
                placeholder="30"
                unitToggle={{
                  options: FEED_SYSTEM_OPTIONS,
                  value: f.system,
                  onChange: (system) => update({ system: system as YarnCountSystem }),
                }}
              />
              <CalcResultRow
                label="Tahmini gramaj"
                value={structure ? formatNumber(structure.gsm, 1) : '—'}
                unit="gr/m²"
                emphasis="primary"
              />
              <CalcResultRow label="İlmek boyu" value={structure ? formatNumber(structure.loopLengthMm, 2) : '—'} unit="mm" />
              <CalcResultRow label="İplik" value={structure ? formatNumber(structure.yarnTex, 1) : '—'} unit="Tex" />
              {structure === null ? (
                <CalcNoteRow text="Hesap için sıra, çubuk, 50 iğne uzunluğu ve iplik numarasını girin." />
              ) : null}
              <CalcFormulaRow text="İlmek boyu = 50 iğne uzunluğu (cm) ÷ 5. Gramaj = sıra × çubuk × (çift plakada ×2) × ilmek boyu (mm) × Tex ÷ 100." />
            </CalcTable>
          </>
        )}
        <CalcClearButton onClear={() => update({ ...INITIAL, mode: f.mode })} />
      </Screen>
    </View>
  );
}
