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
  EMPTY_FEED_ROW,
  YarnFeedRowsEditor,
  toFeedRows,
  type YarnFeedRowFields,
} from '../../components/YarnFeedRowsEditor';
import { calculateKnitProduction } from '../../features/calculators/formulas';
import { parseNumber, formatNumber } from '../../features/calculators/parse';
import { usePersistedFields } from '../../features/calculators/usePersistedFields';
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Screen } from '../../ui';

interface Fields {
  rows: YarnFeedRowFields[];
  needles: string;
  rpm: string;
  efficiency: string;
  hoursPerDay: string;
  fee: string;
}

const INITIAL: Fields = {
  rows: [{ ...EMPTY_FEED_ROW }],
  needles: '',
  rpm: '',
  efficiency: '90',
  hoursPerDay: '24',
  fee: '',
};

// Eski "hız × saat" sürümünün kayıtlarıyla karışmasın diye yeni anahtar.
export function ProductionCalculator({ navigation }: RootStackScreenProps<'ProductionCalculator'>) {
  const t = useTheme();
  const [f, update] = usePersistedFields('knit_production', INITIAL);

  // Kendi üst bandımızı (AppBar) çiziyoruz; yığının başlığı kapanıyor.
  useLayoutEffect(() => navigation.setOptions({ headerShown: false }), [navigation]);

  const result = useMemo(() => {
    const needles = parseNumber(f.needles);
    const rpm = parseNumber(f.rpm);
    if (needles <= 0 || rpm <= 0) return null;
    const r = calculateKnitProduction({
      rows: toFeedRows(f.rows),
      needles,
      rpm,
      efficiencyPercent: parseNumber(f.efficiency),
      hoursPerDay: parseNumber(f.hoursPerDay),
      knittingFeePerKg: parseNumber(f.fee),
    });
    return r.kgPerHour > 0 ? r : null;
  }, [f.rows, f.needles, f.rpm, f.efficiency, f.hoursPerDay, f.fee]);

  const multiYarn = (result?.percents.filter((p) => p > 0).length ?? 0) > 1;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title={tr('Üretim hesaplama')} leading="back" onBack={() => navigation.goBack()} />
      <Screen>
        <Text style={[t.type.body14, { color: t.colors.ink3 }]}>
          {tr('Makinede örülen her iplik için 50 iğnedeki uzunluğu, numarasını ve sistem sayısını girin; ardından makine bilgilerini doldurun.')}
        </Text>

        <CalcTable title={tr('Örme üretim hesabı')}>
          <CalcSectionRow label={tr('İplikler')} />
          <YarnFeedRowsEditor rows={f.rows} onChange={(rows) => update({ rows })} />

          <CalcSectionRow label={tr('Makine')} />
          <CalcInputRow
            label={tr('İğne sayısı')}
            hint={tr('Bilmiyorsanız: çap (inç) × incelik (E) × 3,14')}
            value={f.needles}
            onChangeText={(v) => update({ needles: v })}
            placeholder="2568"
            keyboardType="number-pad"
            unit={tr('iğne')}
          />
          <CalcInputRow
            label={tr('Makine devri')}
            value={f.rpm}
            onChangeText={(v) => update({ rpm: v })}
            placeholder="25"
            unit={tr('devir/dk')}
          />
          <CalcInputRow
            label={tr('Randıman')}
            value={f.efficiency}
            onChangeText={(v) => update({ efficiency: v })}
            placeholder="90"
            unit="%"
          />
          <CalcInputRow
            label={tr('Günlük çalışma')}
            value={f.hoursPerDay}
            onChangeText={(v) => update({ hoursPerDay: v })}
            placeholder="24"
            unit={tr('saat')}
          />
          <CalcInputRow
            label={tr('Fason ücreti')}
            hint={tr('İsteğe bağlı')}
            value={f.fee}
            onChangeText={(v) => update({ fee: v })}
            placeholder="65"
            unit="₺/kg"
          />

          <CalcSectionRow label={tr('Sonuç')} />
          <CalcResultRow
            label={tr('Saatlik üretim')}
            value={result ? formatNumber(result.kgPerHour, 1) : '—'}
            unit="kg"
          />
          <CalcResultRow
            label={tr('Günlük üretim')}
            value={result ? formatNumber(result.kgPerDay, 0) : '—'}
            unit="kg"
            emphasis="primary"
          />
          {result && result.dailyFeeIncome !== null ? (
            <CalcResultRow label={tr('Günlük fason geliri')} value={formatNumber(result.dailyFeeIncome, 0)} unit="₺" />
          ) : null}
          {/* Birden fazla iplik varsa her birinin kumaştaki payı. */}
          {result && multiYarn
            ? result.percents
                .map((percent, index) => ({ percent, index }))
                .filter(({ percent }) => percent > 0)
                .map(({ percent, index }) => (
                  <CalcResultRow key={index} label={tr('{n}. iplik payı', { n: index + 1 })} value={`%${formatNumber(percent, 1)}`} />
                ))
            : null}
          {result === null ? (
            <CalcNoteRow text={tr('Hesap için iplik satırlarını, iğne sayısını ve makine devrini girin.')} />
          ) : null}
          <CalcFormulaRow text={tr('Bir devirde örülen gram = Σ (sistem sayısı × iğne × ilmek boyu ÷ 1000 × Tex ÷ 1000). Saatlik = bu gram × devir × 60 × randıman ÷ 1000. Günlük = saatlik × çalışma saati.')} />
        </CalcTable>
        <CalcClearButton onClear={() => update(INITIAL)} />
      </Screen>
    </View>
  );
}
