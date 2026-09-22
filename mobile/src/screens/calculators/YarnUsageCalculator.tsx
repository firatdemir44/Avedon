import React, { useLayoutEffect, useMemo } from 'react';
import { View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  CalcTable,
  CalcInputRow,
  CalcResultRow,
  CalcNoteRow,
  CalcFormulaRow,
  CalcClearButton,
} from '../../components/CalcTable';
import { calculateYarnUsageKg } from '../../features/calculators/formulas';
import { parseNumber, formatNumber } from '../../features/calculators/parse';
import { usePersistedFields } from '../../features/calculators/usePersistedFields';
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Screen } from '../../ui';

interface Fields {
  // Üretilecek miktar metre ya da kg olarak girilir.
  unit: 'metre' | 'kg';
  length: string;
  weightGsm: string;
  widthCm: string;
  wastage: string;
}

const INITIAL: Fields = { unit: 'metre', length: '', weightGsm: '', widthCm: '', wastage: '0' };

export function YarnUsageCalculator({ navigation }: RootStackScreenProps<'YarnUsageCalculator'>) {
  const t = useTheme();
  const [fields, update] = usePersistedFields('yarn_usage', INITIAL);

  // Kendi üst bandımızı (AppBar) çiziyoruz; yığının başlığı kapanıyor.
  useLayoutEffect(() => navigation.setOptions({ headerShown: false }), [navigation]);

  const { unit, length, weightGsm, widthCm, wastage } = fields;
  const byKg = unit === 'kg';

  // Kg girildiyse: iplik = kumaş kg × (1 + fire); gramaj ve en yalnızca kaç metre kumaş
  // ettiğini göstermek için kullanılır (isteğe bağlı).
  const gsm = parseNumber(weightGsm);
  const width = parseNumber(widthCm);
  const metersPerKg = gsm > 0 && width > 0 ? 1000 / (gsm * (width / 100)) : null;
  const result = useMemo(() => {
    if (!length) return null;
    const wastagePercent = parseNumber(wastage);
    if (byKg) return parseNumber(length) * (1 + wastagePercent / 100);
    if (!weightGsm || !widthCm) return null;
    return calculateYarnUsageKg({
      fabricLengthMeters: parseNumber(length),
      weightGsm: parseNumber(weightGsm),
      widthCm: parseNumber(widthCm),
      wastagePercent,
    });
  }, [byKg, length, weightGsm, widthCm, wastage]);
  const fabricMeters = byKg && length && metersPerKg ? parseNumber(length) * metersPerKg : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title="İplik ihtiyacı" leading="back" onBack={() => navigation.goBack()} />
      <Screen>
        <CalcTable title="İplik ihtiyacı">
          <CalcInputRow
            label="Üretilecek kumaş miktarı"
            hint={byKg ? 'Kg ile hesaplarken gramaj ve en zorunlu değil' : undefined}
            value={length}
            onChangeText={(v) => update({ length: v })}
            placeholder="500"
            unitToggle={{
              options: [
                { value: 'metre', label: 'metre' },
                { value: 'kg', label: 'kg' },
              ],
              value: unit,
              onChange: (v) => update({ unit: v === 'kg' ? 'kg' : 'metre' }),
            }}
          />
          <CalcInputRow
            label="Kumaş gramajı"
            value={weightGsm}
            onChangeText={(v) => update({ weightGsm: v })}
            placeholder="200"
            unit="gr/m²"
          />
          <CalcInputRow
            label="En"
            value={widthCm}
            onChangeText={(v) => update({ widthCm: v })}
            placeholder="160"
            unit="cm"
          />
          <CalcInputRow
            label="Fire oranı"
            value={wastage}
            onChangeText={(v) => update({ wastage: v })}
            placeholder="5"
            unit="%"
          />
          <CalcResultRow
            label="Gerekli iplik miktarı"
            value={result !== null ? formatNumber(result) : '—'}
            unit="kg"
            emphasis="primary"
          />
          {fabricMeters !== null ? (
            <CalcResultRow label="Bu kadar kumaş yaklaşık" value={formatNumber(fabricMeters)} unit="metre" note="Gramaj ve ene göre" />
          ) : null}
          {result === null ? (
            <CalcNoteRow text={byKg ? 'Hesap için kumaş miktarını (kg) girin.' : 'Hesap için uzunluk, gramaj ve en girin.'} />
          ) : null}
          <CalcFormulaRow
            text={byKg ? 'İplik (kg) = kumaş (kg) × (1 + fire ÷ 100)' : 'İplik (kg) = uzunluk × en (m) × gramaj ÷ 1000 × (1 + fire ÷ 100)'}
          />
        </CalcTable>
        <CalcClearButton onClear={() => update(INITIAL)} />
      </Screen>
    </View>
  );
}
