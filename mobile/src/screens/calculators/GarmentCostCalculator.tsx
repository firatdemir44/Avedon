import React, { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextField } from '../../components/TextField';
import { ChipSelect } from '../../components/ChipSelect';
import { ResultCard } from '../../components/ResultCard';
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
        <Text style={styles.section}>Para birimi</Text>
        <Text style={styles.hint}>
          Tüm tutarlar aynı para biriminde girilmelidir. Uygulama kur çevirmez, seçim yalnızca etiketi değiştirir.
        </Text>
        <ChipSelect options={CURRENCIES} value={f.currency} onChange={(currency) => update({ currency })} />

        <Text style={styles.section}>Kumaş</Text>
        <TextField
          label="Kumaş tüketimi (metre/adet)"
          keyboardType="decimal-pad"
          value={f.consumption}
          onChangeText={(v) => update({ consumption: v })}
          placeholder="Örn. 1,4"
        />
        <View style={styles.twoCol}>
          <View style={styles.col}>
            <TextField
              label={`Metre fiyatı (${symbol}/metre)`}
              keyboardType="decimal-pad"
              value={f.fabricPrice}
              onChangeText={(v) => update({ fabricPrice: v })}
              placeholder="Örn. 45"
            />
          </View>
          <View style={styles.col}>
            <TextField
              label="Kesim firesi (%)"
              keyboardType="decimal-pad"
              value={f.wastage}
              onChangeText={(v) => update({ wastage: v })}
              placeholder="Örn. 8"
            />
          </View>
        </View>

        <Text style={styles.section}>Adet başı kalemler</Text>
        <Text style={styles.hint}>
          Her aşamayı ayrı girin; böylece maliyeti hangi aşamanın yükselttiğini görürsünüz. Bilmediğiniz kalemi boş
          bırakın, 0 sayılır.
        </Text>
        {GARMENT_ITEMS.map((item) => (
          <View key={item.key}>
            <TextField
              label={`${item.label} (${symbol}/adet)`}
              keyboardType="decimal-pad"
              value={f[item.key]}
              onChangeText={(v) => update({ [item.key]: v } as Partial<Fields>)}
              placeholder={item.placeholder}
            />
            {item.hint ? <Text style={styles.fieldHint}>{item.hint}</Text> : null}
          </View>
        ))}

        <Text style={styles.section}>Sipariş (isteğe bağlı)</Text>
        <TextField
          label="Sipariş adedi"
          keyboardType="number-pad"
          value={f.quantity}
          onChangeText={(v) => update({ quantity: v })}
          placeholder="Örn. 500"
        />

        {result ? (
          <>
            <ResultCard
              rows={[
                ...result.rows.map((row) => ({
                  label: row.label,
                  value: `${formatNumber(row.amount)} ${symbol}`,
                  note: row.largest
                    ? `Toplam içinde %${formatNumber(row.sharePercent, 1)}, en büyük kalem`
                    : `Toplam içinde %${formatNumber(row.sharePercent, 1)}`,
                  highlight: row.largest,
                })),
                {
                  label: 'Adet maliyeti',
                  value: `${formatNumber(result.totalCost)} ${symbol}`,
                  strong: true,
                },
                ...(result.orderTotal !== null
                  ? [
                      {
                        label: 'Sipariş toplamı',
                        value: `${formatNumber(result.orderTotal)} ${symbol}`,
                        note: `${formatNumber(parseNumber(f.quantity), 0)} adet`,
                      },
                    ]
                  : []),
              ]}
            />
            {result.emptyLabels.length ? (
              <Text style={styles.footnote}>Boş kalemler: {result.emptyLabels.join(', ')}.</Text>
            ) : null}
            <Text style={styles.footnote}>
              Kumaş = tüketim × metre fiyatı × (1 + kesim firesi). Adet maliyeti bu kalemlerin toplamıdır; kâr ve vergi
              eklenmez.
            </Text>
          </>
        ) : (
          <Text style={styles.footnote}>Hesap için en az kumaş tüketimi ve metre fiyatı girin.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  section: { ...typography.heading, color: colors.primary, marginBottom: spacing.xs },
  hint: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted, marginBottom: spacing.md },
  fieldHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    marginLeft: spacing.sm,
  },
  twoCol: { flexDirection: 'row', gap: spacing.sm },
  col: { flex: 1 },
  footnote: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm },
});
