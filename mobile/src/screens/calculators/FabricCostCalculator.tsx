import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { colors, fonts, spacing, typography } from '../../theme';

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
export function FabricCostCalculator() {
  const [f, update] = usePersistedFields('fabric_pricing', INITIAL);

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
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.hint}>
          Kumaşa giren her ipliğin kilo fiyatını, kumaştaki oranını ve firesini girin. Oranların toplamı 100 olmalı.
          Uygulama internetten kur çekmez; güncel kuru siz girin.
        </Text>

        <CalcTable title="Kumaş maliyeti ve satış fiyatı">
          <CalcSectionRow label="İplikler" />
          <CalcSubRow header>
            <CalcSubHeadCell label="#" style={styles.colIndexHead} />
            <CalcSubHeadCell label="Fiyat/kg" style={calcCells.flex2} />
            <CalcSubHeadCell label="Oran %" style={calcCells.flex1} />
            <CalcSubHeadCell label="Fire %" style={calcCells.flex1} />
            <View style={styles.colRemoveHead} />
          </CalcSubRow>
          {f.yarns.map((yarn, index) => (
            <CalcSubRow key={index}>
              <Text style={styles.index}>{index + 1}</Text>
              <View style={[calcCells.flex2, styles.priceCell]}>
                <TableInput
                  style={calcCells.flex1}
                  value={yarn.price}
                  onChangeText={(v) => updateYarn(index, { price: v })}
                  placeholder="3,20"
                  accessibilityLabel={`${index + 1}. iplik kilo fiyatı`}
                />
                <UnitToggle
                  options={CURRENCIES}
                  value={yarn.currency}
                  onChange={(currency) => updateYarn(index, { currency })}
                  label={`${index + 1}. iplik para birimi`}
                />
              </View>
              <TableInput
                style={calcCells.flex1}
                value={yarn.ratio}
                onChangeText={(v) => updateYarn(index, { ratio: v })}
                placeholder="95"
                accessibilityLabel={`${index + 1}. iplik oranı, yüzde`}
              />
              <TableInput
                style={calcCells.flex1}
                value={yarn.wastage}
                onChangeText={(v) => updateYarn(index, { wastage: v })}
                placeholder="5"
                accessibilityLabel={`${index + 1}. iplik firesi, yüzde`}
              />
              <CalcRemoveCell
                label={`${index + 1}. ipliği kaldır`}
                onPress={f.yarns.length > 1 ? () => update({ yarns: f.yarns.filter((_, i) => i !== index) }) : undefined}
              />
            </CalcSubRow>
          ))}
          {f.yarns.length < MAX_YARNS ? (
            <CalcAddRow label="İplik ekle" onPress={() => update({ yarns: [...f.yarns, { ...EMPTY_YARN }] })} />
          ) : null}

          <CalcSectionRow label="Kur" />
          <CalcInputRow
            label="1 $"
            hint="Dolarla iplik girdiyseniz zorunlu"
            value={f.usdTry}
            onChangeText={(v) => update({ usdTry: v })}
            placeholder="43,17"
            unit="₺"
            error={needsUsd && parseNumber(f.usdTry) <= 0 ? 'Dolar kuru gerekli' : undefined}
          />
          <CalcInputRow
            label="1 €"
            hint="Euro ile iplik girdiyseniz zorunlu"
            value={f.eurTry}
            onChangeText={(v) => update({ eurTry: v })}
            placeholder="48,35"
            unit="₺"
            error={needsEur && parseNumber(f.eurTry) <= 0 ? 'Euro kuru gerekli' : undefined}
          />

          <CalcSectionRow label="Fason, gider ve kâr" />
          <CalcInputRow
            label="Örme fason"
            value={f.knittingFee}
            onChangeText={(v) => update({ knittingFee: v })}
            placeholder="65"
            unit="₺/kg"
          />
          <CalcInputRow
            label="Genel gider"
            value={f.overhead}
            onChangeText={(v) => update({ overhead: v })}
            placeholder="5"
            unit="%"
          />
          <CalcInputRow
            label="Boya fason"
            hint="Ham kilo üzerinden"
            value={f.dyeingFee}
            onChangeText={(v) => update({ dyeingFee: v })}
            placeholder="70"
            unit="₺/kg"
          />
          <CalcInputRow
            label="Boya firesi"
            value={f.dyeingLoss}
            onChangeText={(v) => update({ dyeingLoss: v })}
            placeholder="8"
            unit="%"
          />
          <CalcInputRow
            label="Kâr oranı"
            value={f.profit}
            onChangeText={(v) => update({ profit: v })}
            placeholder="20"
            unit="%"
          />

          <CalcSectionRow label="Metre fiyatı için (isteğe bağlı)" />
          <CalcInputRow
            label="Gramaj"
            value={f.weightGsm}
            onChangeText={(v) => update({ weightGsm: v })}
            placeholder="200"
            unit="gr/m²"
          />
          <CalcInputRow
            label="En"
            value={f.widthCm}
            onChangeText={(v) => update({ widthCm: v })}
            placeholder="180"
            unit="cm"
          />

          {missingRate ? (
            <CalcNoteRow
              tone="warning"
              text="Dolar ya da euro ile girilen iplik fiyatı var; hesap için ilgili kuru girin."
            />
          ) : null}
          {result && Math.abs(result.ratioTotal - 100) > 0.01 ? (
            <CalcNoteRow
              tone="warning"
              text={`İplik oranlarının toplamı %${formatNumber(result.ratioTotal, 1)}; 100 olmalı.`}
            />
          ) : null}

          <CalcSectionRow label="Sonuç (kilo)" />
          <CalcResultRow
            label="İplik maliyeti"
            note={result ? fxNote(result.yarnCostPerKg) : undefined}
            value={value(result?.yarnCostPerKg)}
            unit="₺/kg"
          />
          <CalcResultRow
            label="Ham maliyet"
            note={result ? fxNote(result.greigeCostPerKg) : undefined}
            value={value(result?.greigeCostPerKg)}
            unit="₺/kg"
          />
          <CalcResultRow
            label="Ham satış"
            note={result ? fxNote(result.greigeSalePerKg) : undefined}
            value={value(result?.greigeSalePerKg)}
            unit="₺/kg"
          />
          <CalcResultRow
            label="Boyalı maliyet"
            note={result ? fxNote(result.dyedCostPerKg) : undefined}
            value={value(result?.dyedCostPerKg)}
            unit="₺/kg"
          />
          <CalcResultRow
            label="Boyalı satış"
            note={result ? fxNote(result.dyedSalePerKg) : undefined}
            value={value(result?.dyedSalePerKg)}
            unit="₺/kg"
            emphasis="primary"
          />
          {result && result.metersPerKg ? (
            <CalcResultRow label="1 kg kumaş" value={formatNumber(result.metersPerKg, 2)} unit="metre" />
          ) : null}
          {result && result.metersPerKg ? (
            <CalcResultRow
              label="Boyalı satış (metre)"
              value={formatNumber(result.dyedSalePerKg.TRY / result.metersPerKg)}
              unit="₺/m"
            />
          ) : null}
          {result === null && !missingRate ? (
            <CalcNoteRow text="Hesap için en az bir ipliğin fiyatını ve oranını girin." />
          ) : null}
          <CalcFormulaRow text="Ham maliyet: iplik (fire dahil) + örme fason, üzerine genel gider. Boyalı maliyet: boya ücreti ham kilo üzerinden ödenir, toplam maliyet firesi düşülmüş boyalı kiloya bölünür (100 kg ham kumaş %8 fireyle 92 kg boyalı çıkar). Satış fiyatları maliyete kâr oranı eklenerek bulunur. 1 kg kumaş = 100.000 ÷ (gramaj × en)." />
        </CalcTable>
        <CalcClearButton onClear={() => update(INITIAL)} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
  hint: { ...typography.caption, fontFamily: fonts.regular, color: colors.textMuted, marginBottom: spacing.sm },
  colIndexHead: { width: 16 },
  colRemoveHead: { width: 24 },
  index: { width: 16, ...typography.caption, fontSize: 13, color: colors.primary, textAlign: 'center' },
  priceCell: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
