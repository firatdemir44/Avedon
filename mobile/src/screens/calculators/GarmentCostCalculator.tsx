import React, { useEffect, useMemo } from 'react';
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
import { calculateGarmentCost, type Currency } from '../../features/calculators/formulas';
import {
  GARMENT_ITEMS,
  buildGarmentBreakdown,
  type GarmentItemAmounts,
  type GarmentItemKey,
} from '../../features/calculators/garmentItems';
import { parseNumber, formatNumber } from '../../features/calculators/parse';
import { usePersistedFields } from '../../features/calculators/usePersistedFields';
import { colors, fonts, spacing, typography } from '../../theme';

type ItemFields = Record<GarmentItemKey, string>;

interface Fields extends ItemFields {
  consumption: string;
  fabricPrice: string;
  wastage: string;
  quantity: string;
  currency: Currency;
  /** Eski sürümün "İşçilik" alanı; açılışta dikime taşınır (aşağıdaki useEffect). */
  labor?: string;
}

const INITIAL: Fields = {
  consumption: '',
  fabricPrice: '',
  wastage: '0',
  cutting: '',
  sewing: '',
  finishing: '',
  accessory: '',
  packaging: '',
  shipping: '',
  overhead: '',
  quantity: '',
  currency: 'TRY',
};

const CURRENCIES: { value: Currency; label: string }[] = [
  { value: 'TRY', label: '₺ TRY' },
  { value: 'USD', label: '$ USD' },
  { value: 'EUR', label: '€ EUR' },
];

const SYMBOL: Record<Currency, string> = { TRY: '₺', USD: '$', EUR: '€' };

export function GarmentCostCalculator() {
  const [f, update] = usePersistedFields('garment_cost', INITIAL);
  const symbol = SYMBOL[f.currency] ?? '₺';

  // Eski kayıtlarda tek bir "İşçilik" alanı vardı; kalemler ayrılınca karşılığı
  // dikim oldu. Kullanıcının girdiği değer kaybolmasın diye bir kez taşınır.
  // (Aksesuar anahtarı değişmediği için kendiliğinden korunur.)
  useEffect(() => {
    if (f.labor && !f.sewing) update({ sewing: f.labor, labor: '' });
    else if (f.labor) update({ labor: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.labor]);

  const result = useMemo(() => {
    if (!f.consumption || !f.fabricPrice) return null;
    const { fabricCost } = calculateGarmentCost({
      fabricConsumptionMeters: parseNumber(f.consumption),
      fabricPricePerMeter: parseNumber(f.fabricPrice),
      wastagePercent: parseNumber(f.wastage),
      laborCost: 0,
      accessoryCost: 0,
    });
    const amounts = GARMENT_ITEMS.reduce((acc, item) => {
      acc[item.key] = parseNumber(f[item.key]);
      return acc;
    }, {} as GarmentItemAmounts);
    return buildGarmentBreakdown(fabricCost, amounts, parseNumber(f.quantity));
  }, [f]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Para birimi</Text>
        <ChipSelect options={CURRENCIES} value={f.currency} onChange={(currency) => update({ currency })} />
        <Text style={styles.hint}>
          Tüm tutarlar aynı para biriminde girilmelidir. Uygulama kur çevirmez, seçim yalnızca etiketi değiştirir.
          Bilmediğiniz kalemi boş bırakın, 0 sayılır.
        </Text>

        <CalcTable title="Konfeksiyon maliyeti (adet)">
          <CalcSectionRow label="Kumaş" />
          <CalcInputRow
            label="Kumaş tüketimi"
            value={f.consumption}
            onChangeText={(v) => update({ consumption: v })}
            placeholder="1,4"
            unit="m/adet"
          />
          <CalcInputRow
            label="Metre fiyatı"
            value={f.fabricPrice}
            onChangeText={(v) => update({ fabricPrice: v })}
            placeholder="45"
            unit={`${symbol}/m`}
          />
          <CalcInputRow
            label="Kesim firesi"
            value={f.wastage}
            onChangeText={(v) => update({ wastage: v })}
            placeholder="8"
            unit="%"
          />

          <CalcSectionRow label="Adet başı kalemler" />
          {GARMENT_ITEMS.map((item) => (
            <CalcInputRow
              key={item.key}
              label={item.label}
              hint={item.hint}
              value={f[item.key]}
              onChangeText={(v) => update({ [item.key]: v } as Partial<Fields>)}
              placeholder={item.placeholder.replace('Örn. ', '')}
              unit={`${symbol}/adet`}
            />
          ))}

          <CalcSectionRow label="Sipariş (isteğe bağlı)" />
          <CalcInputRow
            label="Sipariş adedi"
            value={f.quantity}
            onChangeText={(v) => update({ quantity: v })}
            placeholder="500"
            keyboardType="number-pad"
            unit="adet"
          />

          <CalcSectionRow label="Sonuç" />
          {result
            ? result.rows.map((row) => (
                <CalcResultRow
                  key={row.key}
                  label={row.label}
                  note={
                    row.largest
                      ? `Toplam içinde %${formatNumber(row.sharePercent, 1)}, en büyük kalem`
                      : `Toplam içinde %${formatNumber(row.sharePercent, 1)}`
                  }
                  value={formatNumber(row.amount)}
                  unit={symbol}
                />
              ))
            : null}
          <CalcResultRow
            label="Adet maliyeti"
            value={result ? formatNumber(result.totalCost) : '—'}
            unit={symbol}
            emphasis="primary"
          />
          {result && result.orderTotal !== null ? (
            <CalcResultRow
              label="Sipariş toplamı"
              note={`${formatNumber(parseNumber(f.quantity), 0)} adet`}
              value={formatNumber(result.orderTotal)}
              unit={symbol}
            />
          ) : null}
          {result === null ? (
            <CalcNoteRow text="Hesap için en az kumaş tüketimi ve metre fiyatı girin." />
          ) : null}
          {result && result.emptyLabels.length ? (
            <CalcNoteRow text={`Boş kalemler: ${result.emptyLabels.join(', ')}.`} />
          ) : null}
          <CalcFormulaRow text="Kumaş = tüketim × metre fiyatı × (1 + kesim firesi ÷ 100). Adet maliyeti bu kalemlerin toplamıdır; kâr ve vergi eklenmez. Sipariş toplamı = adet maliyeti × sipariş adedi." />
        </CalcTable>
        <CalcClearButton onClear={() => update({ ...INITIAL, currency: f.currency })} />
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
