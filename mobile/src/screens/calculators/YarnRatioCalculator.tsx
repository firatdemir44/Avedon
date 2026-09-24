import React, { useLayoutEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { tr } from '../../i18n';
import {
  CalcTable,
  CalcSectionRow,
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
import { yarnUsageRatios } from '../../features/calculators/formulas';
import { formatNumber } from '../../features/calculators/parse';
import { usePersistedFields } from '../../features/calculators/usePersistedFields';
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Screen } from '../../ui';

interface Fields {
  rows: YarnFeedRowFields[];
}

const INITIAL: Fields = { rows: [{ ...EMPTY_FEED_ROW }, { ...EMPTY_FEED_ROW, system: 'denye' }] };

export function YarnRatioCalculator({ navigation }: RootStackScreenProps<'YarnRatioCalculator'>) {
  const t = useTheme();
  const [f, update] = usePersistedFields('yarn_ratio', INITIAL);

  // Kendi üst bandımızı (AppBar) çiziyoruz; yığının başlığı kapanıyor.
  useLayoutEffect(() => navigation.setOptions({ headerShown: false }), [navigation]);

  const percents = useMemo(() => yarnUsageRatios(toFeedRows(f.rows)), [f.rows]);
  const usable = percents.filter((p) => p > 0).length;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title={tr('İplik kullanım oranı')} leading="back" onBack={() => navigation.goBack()} />
      <Screen>
        <Text style={[t.type.body14, { color: t.colors.ink3 }]}>
          {tr('Kumaşa giren her iplik için 50 iğnedeki iplik uzunluğunu, numarasını ve kaç sistemden beslendiğini girin. Örneğin pamuk ve likralı bir kumaşta iki iplik doldurun.')}
        </Text>

        <CalcTable title={tr('İplik oranı')}>
          <CalcSectionRow label={tr('İplikler')} />
          <YarnFeedRowsEditor rows={f.rows} onChange={(rows) => update({ rows })} />
          <CalcSectionRow label={tr('Kumaştaki pay')} />
          {f.rows.map((_, index) => (
            <CalcResultRow
              key={index}
              label={tr('{n}. iplik payı', { n: index + 1 })}
              value={percents[index] > 0 ? `%${formatNumber(percents[index], 1)}` : '—'}
            />
          ))}
          {usable === 0 ? (
            <CalcNoteRow text={tr('Hesap için her iplikte uzunluk, numara ve sistem sayısı dolu olmalı.')} />
          ) : null}
          <CalcFormulaRow text={tr('Her iplik için bir devirde örülen gram = sistem sayısı × ilmek boyu (50 iğne cm ÷ 5) × Tex. Paylar bu gramların toplamına bölünür.')} />
        </CalcTable>
        <CalcClearButton onClear={() => update(INITIAL)} />
      </Screen>
    </View>
  );
}
