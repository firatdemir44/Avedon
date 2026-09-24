import React, { useEffect, useLayoutEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { tr } from '../../i18n';
import { TableInput } from '../../components/TableInput';
import { UnitToggle } from '../../components/UnitToggle';
import {
  CalcTable,
  CalcSectionRow,
  CalcInputRow,
  CalcResultRow,
  CalcNoteRow,
  CalcFormulaRow,
  CalcSubRow,
  CalcSubHeadCell,
  CalcAddRow,
  CalcRemoveCell,
  CalcClearButton,
  calcCells,
} from '../../components/CalcTable';
import { calculateFabricPricing, type Currency, type MoneyTriple } from '../../features/calculators/formulas';
import { parseNumber, formatNumber } from '../../features/calculators/parse';
import { usePersistedFields } from '../../features/calculators/usePersistedFields';
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Screen } from '../../ui';
import { fxDateLabel, useFx } from '../../features/fx/useFx';

interface YarnFields {
  price: string;
  currency: Currency;
  ratio: string;
  wastage: string;
}

interface Fields {
  yarns: YarnFields[];
  usdTry: string;
  eurTry: string;
  // Kullanıcı kuru elle değiştirdiyse true; değilse TCMB döviz satışı otomatik yazılır.
  usdManual: boolean;
  eurManual: boolean;
  knittingFee: string;
  overhead: string;
  dyeingFee: string;
  dyeingLoss: string;
  profit: string;
  weightGsm: string;
  widthCm: string;
}

const EMPTY_YARN: YarnFields = { price: '', currency: 'TRY', ratio: '', wastage: '0' };

const INITIAL: Fields = {
  yarns: [{ ...EMPTY_YARN, ratio: '100' }],
  usdTry: '',
  eurTry: '',
  usdManual: false,
  eurManual: false,
  knittingFee: '',
  overhead: '0',
  dyeingFee: '',
  dyeingLoss: '0',
  profit: '0',
  weightGsm: '',
  widthCm: '',
};

const MAX_YARNS = 5;

const CURRENCIES: { value: Currency; label: string }[] = [
  { value: 'TRY', label: '₺' },
  { value: 'USD', label: '$' },
  { value: 'EUR', label: '€' },
];

// Sonuç satırında değer ₺ olarak gösterilir; döviz karşılıkları etiketin
// altındaki küçük nota iner (375 px'te tek satıra üç para birimi sığmıyor).
function fxNote(m: MoneyTriple): string | undefined {
  const parts: string[] = [];
  if (m.USD !== null) parts.push(`${formatNumber(m.USD)} $`);
  if (m.EUR !== null) parts.push(`${formatNumber(m.EUR)} €`);
  return parts.length ? parts.join(' · ') : undefined;
}

// Eski tek iplikli "₺/metre" sürümünün kayıtlarıyla karışmasın diye yeni anahtar.
export function FabricCostCalculator({ navigation }: RootStackScreenProps<'FabricCostCalculator'>) {
  const t = useTheme();
  const [f, update] = usePersistedFields('fabric_pricing', INITIAL);

  // Kendi üst bandımızı (AppBar) çiziyoruz; yığının başlığı kapanıyor.
  useLayoutEffect(() => navigation.setOptions({ headerShown: false }), [navigation]);

  // TCMB döviz satış kuru (kullanıcı kuralı): elle değiştirilmedikçe alanlara yazılır.
  const { fx, failed: fxFailed } = useFx();
  const tcmbUsd = fx?.usd ? formatNumber(fx.usd, 4) : null;
  const tcmbEur = fx?.eur ? formatNumber(fx.eur, 4) : null;
  useEffect(() => {
    const patch: Partial<Fields> = {};
    if (tcmbUsd && !f.usdManual && f.usdTry !== tcmbUsd) patch.usdTry = tcmbUsd;
    if (tcmbEur && !f.eurManual && f.eurTry !== tcmbEur) patch.eurTry = tcmbEur;
    if (Object.keys(patch).length) update(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tcmbUsd, tcmbEur, f.usdManual, f.eurManual, f.usdTry, f.eurTry]);
  const fxCaption = (manual: boolean, reset: () => void) => {
    if (fx && !manual) return <CalcNoteRow text={tr('TCMB döviz satış · {date}', { date: fxDateLabel(fx.date) })} />;
    if (fx && manual) return <CalcNoteRow text={tr('Elle girildi')} action={{ label: tr("TCMB'ye dön"), onPress: reset }} />;
    if (fxFailed && !manual) return <CalcNoteRow text={tr('Kur alınamadı, elle girin')} />;
    return null;
  };

  const updateYarn = (index: number, patch: Partial<YarnFields>) =>
    update({ yarns: f.yarns.map((y, i) => (i === index ? { ...y, ...patch } : y)) });

  const needsUsd = f.yarns.some((y) => y.currency === 'USD' && parseNumber(y.price) > 0);
  const needsEur = f.yarns.some((y) => y.currency === 'EUR' && parseNumber(y.price) > 0);
  const missingRate = (needsUsd && parseNumber(f.usdTry) <= 0) || (needsEur && parseNumber(f.eurTry) <= 0);

  const result = useMemo(() => {
    const yarns = f.yarns.map((y) => ({
      price: parseNumber(y.price),
      currency: y.currency,
      ratioPercent: parseNumber(y.ratio),
      wastagePercent: parseNumber(y.wastage),
    }));
    if (!yarns.some((y) => y.price > 0 && y.ratioPercent > 0) || missingRate) return null;
    return calculateFabricPricing({
      yarns,
      usdTry: parseNumber(f.usdTry),
      eurTry: parseNumber(f.eurTry),
      knittingFeePerKg: parseNumber(f.knittingFee),
      overheadPercent: parseNumber(f.overhead),
      dyeingFeePerKg: parseNumber(f.dyeingFee),
      dyeingLossPercent: parseNumber(f.dyeingLoss),
      profitPercent: parseNumber(f.profit),
      weightGsm: parseNumber(f.weightGsm),
      widthCm: parseNumber(f.widthCm),
    });
  }, [f, missingRate]);

  const value = (m: MoneyTriple | undefined) => (m ? formatNumber(m.TRY) : '—');

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title={tr('Maliyet ve satış fiyatı')} leading="back" onBack={() => navigation.goBack()} />
      <Screen>
        <Text style={[t.type.body14, { color: t.colors.ink3 }]}>
          {tr('Kumaşa giren her ipliğin kilo fiyatını, kumaştaki oranını ve firesini girin. Oranların toplamı 100 olmalı. Kur, TCMB döviz satış kurundan otomatik gelir; isterseniz değiştirebilirsiniz.')}
        </Text>

        <CalcTable title={tr('Kumaş maliyeti ve satış fiyatı')}>
          <CalcSectionRow label={tr('İplikler')} />
          <CalcSubRow header>
            <CalcSubHeadCell label="#" style={styles.colIndexHead} />
            <CalcSubHeadCell label={tr('Fiyat/kg')} style={calcCells.flex2} />
            <CalcSubHeadCell label={tr('Oran %')} style={calcCells.flex1} />
            <CalcSubHeadCell label={tr('Fire %')} style={calcCells.flex1} />
            <View style={styles.colRemoveHead} />
          </CalcSubRow>
          {f.yarns.map((yarn, index) => (
            <CalcSubRow key={index}>
              <Text style={[t.type.caption12, calcCells.index, { color: t.colors.brand }]}>{index + 1}</Text>
              <View style={[calcCells.flex2, styles.priceCell, { gap: t.space[1] }]}>
                <TableInput
                  style={calcCells.flex1}
                  value={yarn.price}
                  onChangeText={(v) => updateYarn(index, { price: v })}
                  placeholder="3,20"
                  accessibilityLabel={tr('{n}. iplik kilo fiyatı', { n: index + 1 })}
                />
                <UnitToggle
                  options={CURRENCIES}
                  value={yarn.currency}
                  onChange={(currency) => updateYarn(index, { currency })}
                  label={tr('{n}. iplik para birimi', { n: index + 1 })}
                />
              </View>
              <TableInput
                style={calcCells.flex1}
                value={yarn.ratio}
                onChangeText={(v) => updateYarn(index, { ratio: v })}
                placeholder="95"
                accessibilityLabel={tr('{n}. iplik oranı, yüzde', { n: index + 1 })}
              />
              <TableInput
                style={calcCells.flex1}
                value={yarn.wastage}
                onChangeText={(v) => updateYarn(index, { wastage: v })}
                placeholder="5"
                accessibilityLabel={tr('{n}. iplik firesi, yüzde', { n: index + 1 })}
              />
              <CalcRemoveCell
                label={tr('{n}. ipliği kaldır', { n: index + 1 })}
                onPress={f.yarns.length > 1 ? () => update({ yarns: f.yarns.filter((_, i) => i !== index) }) : undefined}
              />
            </CalcSubRow>
          ))}
          {f.yarns.length < MAX_YARNS ? (
            <CalcAddRow label={tr('İplik ekle')} onPress={() => update({ yarns: [...f.yarns, { ...EMPTY_YARN }] })} />
          ) : null}

          <CalcSectionRow label={tr('Kur')} />
          <CalcInputRow
            label="1 $"
            hint={tr('Dolarla iplik girdiyseniz zorunlu')}
            value={f.usdTry}
            onChangeText={(v) => update({ usdTry: v, usdManual: true })}
            placeholder="43,17"
            unit="₺"
            error={needsUsd && parseNumber(f.usdTry) <= 0 ? tr('Dolar kuru gerekli') : undefined}
          />
          {fxCaption(f.usdManual, () => update({ usdManual: false }))}
          <CalcInputRow
            label="1 €"
            hint={tr('Euro ile iplik girdiyseniz zorunlu')}
            value={f.eurTry}
            onChangeText={(v) => update({ eurTry: v, eurManual: true })}
            placeholder="48,35"
            unit="₺"
            error={needsEur && parseNumber(f.eurTry) <= 0 ? tr('Euro kuru gerekli') : undefined}
          />
          {fxCaption(f.eurManual, () => update({ eurManual: false }))}

          <CalcSectionRow label={tr('Fason, gider ve kâr')} />
          <CalcInputRow
            label={tr('Örme fason')}
            value={f.knittingFee}
            onChangeText={(v) => update({ knittingFee: v })}
            placeholder="65"
            unit="₺/kg"
          />
          <CalcInputRow
            label={tr('Genel gider')}
            value={f.overhead}
            onChangeText={(v) => update({ overhead: v })}
            placeholder="5"
            unit="%"
          />
          <CalcInputRow
            label={tr('Boya fason')}
            hint={tr('Ham kilo üzerinden')}
            value={f.dyeingFee}
            onChangeText={(v) => update({ dyeingFee: v })}
            placeholder="70"
            unit="₺/kg"
          />
          <CalcInputRow
            label={tr('Boya firesi')}
            value={f.dyeingLoss}
            onChangeText={(v) => update({ dyeingLoss: v })}
            placeholder="8"
            unit="%"
          />
          <CalcInputRow
            label={tr('Kâr oranı')}
            value={f.profit}
            onChangeText={(v) => update({ profit: v })}
            placeholder="20"
            unit="%"
          />

          <CalcSectionRow label={tr('Metre fiyatı için (isteğe bağlı)')} />
          <CalcInputRow
            label={tr('Gramaj')}
            value={f.weightGsm}
            onChangeText={(v) => update({ weightGsm: v })}
            placeholder="200"
            unit="gr/m²"
          />
          <CalcInputRow
            label={tr('En')}
            value={f.widthCm}
            onChangeText={(v) => update({ widthCm: v })}
            placeholder="180"
            unit="cm"
          />

          {missingRate ? (
            <CalcNoteRow
              tone="warning"
              text={tr('Dolar ya da euro ile girilen iplik fiyatı var; hesap için ilgili kuru girin.')}
            />
          ) : null}
          {result && Math.abs(result.ratioTotal - 100) > 0.01 ? (
            <CalcNoteRow
              tone="warning"
              text={tr('İplik oranlarının toplamı %{n}; 100 olmalı.', { n: formatNumber(result.ratioTotal, 1) })}
            />
          ) : null}

          <CalcSectionRow label={tr('Sonuç (kilo)')} />
          <CalcResultRow
            label={tr('İplik maliyeti')}
            note={result ? fxNote(result.yarnCostPerKg) : undefined}
            value={value(result?.yarnCostPerKg)}
            unit="₺/kg"
          />
          <CalcResultRow
            label={tr('Ham maliyet')}
            note={result ? fxNote(result.greigeCostPerKg) : undefined}
            value={value(result?.greigeCostPerKg)}
            unit="₺/kg"
          />
          <CalcResultRow
            label={tr('Ham satış')}
            note={result ? fxNote(result.greigeSalePerKg) : undefined}
            value={value(result?.greigeSalePerKg)}
            unit="₺/kg"
          />
          <CalcResultRow
            label={tr('Boyalı maliyet')}
            note={result ? fxNote(result.dyedCostPerKg) : undefined}
            value={value(result?.dyedCostPerKg)}
            unit="₺/kg"
          />
          <CalcResultRow
            label={tr('Boyalı satış')}
            note={result ? fxNote(result.dyedSalePerKg) : undefined}
            value={value(result?.dyedSalePerKg)}
            unit="₺/kg"
            emphasis="primary"
          />
          {result && result.metersPerKg ? (
            <CalcResultRow label={tr('1 kg kumaş')} value={formatNumber(result.metersPerKg, 2)} unit={tr('metre')} />
          ) : null}
          {result && result.metersPerKg ? (
            <CalcResultRow
              label={tr('Boyalı satış (metre)')}
              value={formatNumber(result.dyedSalePerKg.TRY / result.metersPerKg)}
              unit="₺/m"
            />
          ) : null}
          {result === null && !missingRate ? (
            <CalcNoteRow text={tr('Hesap için en az bir ipliğin fiyatını ve oranını girin.')} />
          ) : null}
          <CalcFormulaRow text={tr('Ham maliyet: iplik (fire dahil) + örme fason, üzerine genel gider. Boyalı maliyet: boya ücreti ham kilo üzerinden ödenir, toplam maliyet firesi düşülmüş boyalı kiloya bölünür (100 kg ham kumaş %8 fireyle 92 kg boyalı çıkar). Satış fiyatları maliyete kâr oranı eklenerek bulunur. 1 kg kumaş = 100.000 ÷ (gramaj × en).')} />
        </CalcTable>
        <CalcClearButton onClear={() => update(INITIAL)} />
      </Screen>
    </View>
  );
}

// Yalnızca sütun yerleşimi (renk/yazı yok).
const styles = StyleSheet.create({
  colIndexHead: { width: 16 },
  colRemoveHead: { width: 24 },
  priceCell: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
});
