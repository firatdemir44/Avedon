import React, { useEffect, useLayoutEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
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
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Screen, SegmentControl } from '../../ui';

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

export function GarmentCostCalculator({ navigation }: RootStackScreenProps<'GarmentCostCalculator'>) {
  const t = useTheme();
  const [f, update] = usePersistedFields('garment_cost', INITIAL);
  const symbol = SYMBOL[f.currency] ?? '₺';

  // Kendi üst bandımızı (AppBar) çiziyoruz; yığının başlığı kapanıyor.
  useLayoutEffect(() => navigation.setOptions({ headerShown: false }), [navigation]);

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
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title="Konfeksiyon maliyeti" leading="back" onBack={() => navigation.goBack()} />
      <Screen>
        <View style={{ gap: t.space[2] }}>
          <Text style={[t.type.label14, { color: t.colors.ink2 }]}>Para birimi</Text>
          <SegmentControl
            stretch
            accessibilityLabel="Para birimi"
            options={CURRENCIES}
            value={f.currency}
            onChange={(currency) => update({ currency })}
          />
        </View>
        <Text style={[t.type.body14, { color: t.colors.ink3 }]}>
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
      </Screen>
    </View>
  );
}
