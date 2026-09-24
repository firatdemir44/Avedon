import React, { useEffect, useLayoutEffect, useMemo } from 'react';
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
      <AppBar title={tr('Konfeksiyon maliyeti')} leading="back" onBack={() => navigation.goBack()} />
      <Screen>
        <View style={{ gap: t.space[2] }}>
          <Text style={[t.type.label14, { color: t.colors.ink2 }]}>{tr('Para birimi')}</Text>
          <SegmentControl
            stretch
            accessibilityLabel={tr('Para birimi')}
            options={CURRENCIES}
            value={f.currency}
            onChange={(currency) => update({ currency })}
          />
        </View>
        <Text style={[t.type.body14, { color: t.colors.ink3 }]}>
          {tr('Tüm tutarlar aynı para biriminde girilmelidir. Uygulama kur çevirmez, seçim yalnızca etiketi değiştirir. Bilmediğiniz kalemi boş bırakın, 0 sayılır.')}
        </Text>

        <CalcTable title={tr('Konfeksiyon maliyeti (adet)')}>
          <CalcSectionRow label={tr('Kumaş')} />
          <CalcInputRow
            label={tr('Kumaş tüketimi')}
            value={f.consumption}
            onChangeText={(v) => update({ consumption: v })}
            placeholder="1,4"
            unit={tr('m/adet')}
          />
          <CalcInputRow
            label={tr('Metre fiyatı')}
            value={f.fabricPrice}
            onChangeText={(v) => update({ fabricPrice: v })}
            placeholder="45"
            unit={`${symbol}/m`}
          />
          <CalcInputRow
            label={tr('Kesim firesi')}
            value={f.wastage}
            onChangeText={(v) => update({ wastage: v })}
            placeholder="8"
            unit="%"
          />

          <CalcSectionRow label={tr('Adet başı kalemler')} />
          {GARMENT_ITEMS.map((item) => (
            <CalcInputRow
              key={item.key}
              label={tr(item.label)}
              hint={item.hint ? tr(item.hint) : undefined}
              value={f[item.key]}
              onChangeText={(v) => update({ [item.key]: v } as Partial<Fields>)}
              placeholder={item.placeholder.replace('Örn. ', '')}
              unit={tr('{s}/adet', { s: symbol })}
            />
          ))}

          <CalcSectionRow label={tr('Sipariş (isteğe bağlı)')} />
          <CalcInputRow
            label={tr('Sipariş adedi')}
            value={f.quantity}
            onChangeText={(v) => update({ quantity: v })}
            placeholder="500"
            keyboardType="number-pad"
            unit={tr('adet')}
          />

          <CalcSectionRow label={tr('Sonuç')} />
          {result
            ? result.rows.map((row) => (
                <CalcResultRow
                  key={row.key}
                  label={tr(row.label)}
                  note={
                    row.largest
                      ? tr('Toplam içinde %{n}, en büyük kalem', { n: formatNumber(row.sharePercent, 1) })
                      : tr('Toplam içinde %{n}', { n: formatNumber(row.sharePercent, 1) })
                  }
                  value={formatNumber(row.amount)}
                  unit={symbol}
                />
              ))
            : null}
          <CalcResultRow
            label={tr('Adet maliyeti')}
            value={result ? formatNumber(result.totalCost) : '—'}
            unit={symbol}
            emphasis="primary"
          />
          {result && result.orderTotal !== null ? (
            <CalcResultRow
              label={tr('Sipariş toplamı')}
              note={tr('{n} adet', { n: formatNumber(parseNumber(f.quantity), 0) })}
              value={formatNumber(result.orderTotal)}
              unit={symbol}
            />
          ) : null}
          {result === null ? (
            <CalcNoteRow text={tr('Hesap için en az kumaş tüketimi ve metre fiyatı girin.')} />
          ) : null}
          {result && result.emptyLabels.length ? (
            <CalcNoteRow text={tr('Boş kalemler: {list}.', { list: GARMENT_ITEMS.filter((i) => result.emptyLabels.includes(i.label.toLocaleLowerCase('tr-TR'))).map((i) => tr(i.label)).join(', ') })} />
          ) : null}
          <CalcFormulaRow text={tr('Kumaş = tüketim × metre fiyatı × (1 + kesim firesi ÷ 100). Adet maliyeti bu kalemlerin toplamıdır; kâr ve vergi eklenmez. Sipariş toplamı = adet maliyeti × sipariş adedi.')} />
        </CalcTable>
        <CalcClearButton onClear={() => update({ ...INITIAL, currency: f.currency })} />
      </Screen>
    </View>
  );
}
