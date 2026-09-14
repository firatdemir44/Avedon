import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextField } from '../../components/TextField';
import { ResultCard } from '../../components/ResultCard';
import { ChipSelect } from '../../components/ChipSelect';
import { PrimaryButton } from '../../components/PrimaryButton';
import { calculateFabricPricing, type Currency, type MoneyTriple } from '../../features/calculators/formulas';
import { parseNumber, formatNumber } from '../../features/calculators/parse';
import { usePersistedFields } from '../../features/calculators/usePersistedFields';
import { colors, radius, spacing, typography } from '../../theme';

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

function money(m: MoneyTriple) {
  const parts = [`${formatNumber(m.TRY)} ₺`];
  if (m.USD !== null) parts.push(`${formatNumber(m.USD)} $`);
  if (m.EUR !== null) parts.push(`${formatNumber(m.EUR)} €`);
  return parts.join(' · ');
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

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>İplikler</Text>
        <Text style={styles.hint}>Kumaşa giren her ipliğin kilo fiyatını, kumaştaki oranını ve firesini girin. Oranların toplamı 100 olmalı.</Text>

        {f.yarns.map((yarn, index) => (
          <View key={index} style={styles.block}>
            <View style={styles.blockHeader}>
              <Text style={styles.blockTitle}>{index + 1}. iplik</Text>
              {f.yarns.length > 1 ? (
                <Pressable
                  onPress={() => update({ yarns: f.yarns.filter((_, i) => i !== index) })}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`${index + 1}. ipliği kaldır`}
                >
                  <Text style={styles.remove}>Kaldır</Text>
                </Pressable>
              ) : null}
            </View>
            <TextField label="Kilo fiyatı" keyboardType="decimal-pad" value={yarn.price} onChangeText={(v) => updateYarn(index, { price: v })} placeholder="Örn. 3,20" />
            <ChipSelect compact options={CURRENCIES} value={yarn.currency} onChange={(currency) => updateYarn(index, { currency })} />
            <View style={styles.twoCol}>
              <View style={styles.col}>
                <TextField label="Oran (%)" keyboardType="decimal-pad" value={yarn.ratio} onChangeText={(v) => updateYarn(index, { ratio: v })} placeholder="Örn. 95" />
              </View>
              <View style={styles.col}>
                <TextField label="İplik firesi (%)" keyboardType="decimal-pad" value={yarn.wastage} onChangeText={(v) => updateYarn(index, { wastage: v })} placeholder="Örn. 5" />
              </View>
            </View>
          </View>
        ))}
        {f.yarns.length < MAX_YARNS ? (
          <PrimaryButton
            label="İplik Ekle"
            variant="secondary"
            onPress={() => update({ yarns: [...f.yarns, { ...EMPTY_YARN }] })}
            style={{ marginBottom: spacing.lg }}
          />
        ) : null}

        <Text style={styles.section}>Kur</Text>
        <Text style={styles.hint}>Uygulama internetten kur çekmez; güncel kuru siz girin. Boş bırakırsanız sonuç yalnızca ₺ olarak gösterilir.</Text>
        <View style={styles.twoCol}>
          <View style={styles.col}>
            <TextField label="1 $ (₺)" keyboardType="decimal-pad" value={f.usdTry} onChangeText={(v) => update({ usdTry: v })} placeholder="Örn. 43,17" />
          </View>
          <View style={styles.col}>
            <TextField label="1 € (₺)" keyboardType="decimal-pad" value={f.eurTry} onChangeText={(v) => update({ eurTry: v })} placeholder="Örn. 48,35" />
          </View>
        </View>

        <Text style={styles.section}>Fason, gider ve kâr</Text>
        <View style={styles.twoCol}>
          <View style={styles.col}>
            <TextField label="Örme fason (₺/kg)" keyboardType="decimal-pad" value={f.knittingFee} onChangeText={(v) => update({ knittingFee: v })} placeholder="Örn. 65" />
          </View>
          <View style={styles.col}>
            <TextField label="Genel gider (%)" keyboardType="decimal-pad" value={f.overhead} onChangeText={(v) => update({ overhead: v })} placeholder="Örn. 5" />
          </View>
        </View>
        <View style={styles.twoCol}>
          <View style={styles.col}>
            <TextField label="Boya fason (₺/kg)" keyboardType="decimal-pad" value={f.dyeingFee} onChangeText={(v) => update({ dyeingFee: v })} placeholder="Örn. 70" />
          </View>
          <View style={styles.col}>
            <TextField label="Boya firesi (%)" keyboardType="decimal-pad" value={f.dyeingLoss} onChangeText={(v) => update({ dyeingLoss: v })} placeholder="Örn. 8" />
          </View>
        </View>
        <TextField label="Kâr oranı (%)" keyboardType="decimal-pad" value={f.profit} onChangeText={(v) => update({ profit: v })} placeholder="Örn. 20" />

        <Text style={styles.section}>Metre fiyatı için (isteğe bağlı)</Text>
        <View style={styles.twoCol}>
          <View style={styles.col}>
            <TextField label="Gramaj (gr/m²)" keyboardType="decimal-pad" value={f.weightGsm} onChangeText={(v) => update({ weightGsm: v })} placeholder="Örn. 200" />
          </View>
          <View style={styles.col}>
            <TextField label="En (cm)" keyboardType="decimal-pad" value={f.widthCm} onChangeText={(v) => update({ widthCm: v })} placeholder="Örn. 180" />
          </View>
        </View>

        {missingRate ? (
          <Text style={styles.warning}>Dolar ya da euro ile girilen iplik fiyatı var; hesap için ilgili kuru girin.</Text>
        ) : null}
        {result && Math.abs(result.ratioTotal - 100) > 0.01 ? (
          <Text style={styles.warning}>İplik oranlarının toplamı %{formatNumber(result.ratioTotal, 1)}; 100 olmalı.</Text>
        ) : null}

        {result ? (
          <>
            <ResultCard
              rows={[
                { label: 'İplik maliyeti (kg)', value: money(result.yarnCostPerKg) },
                { label: 'Ham maliyet (kg)', value: money(result.greigeCostPerKg) },
                { label: 'Ham satış (kg)', value: money(result.greigeSalePerKg) },
                { label: 'Boyalı maliyet (kg)', value: money(result.dyedCostPerKg) },
                { label: 'Boyalı satış (kg)', value: money(result.dyedSalePerKg) },
                ...(result.metersPerKg
                  ? [
                      { label: '1 kg kumaş', value: `${formatNumber(result.metersPerKg, 2)} metre` },
                      { label: 'Boyalı satış (metre)', value: `${formatNumber(result.dyedSalePerKg.TRY / result.metersPerKg)} ₺` },
                    ]
                  : []),
              ]}
            />
            <Text style={styles.footnote}>
              Ham maliyet: iplik (fire dahil) + örme fason, üzerine genel gider. Boyalı maliyet: ham maliyet + boya fason, boya firesiyle kaybedilen kilo düşülerek. Satış fiyatları maliyete kâr oranı eklenerek bulunur.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  section: { ...typography.heading, color: colors.primary, marginBottom: spacing.xs },
  hint: { ...typography.label, fontWeight: '400', color: colors.textMuted, marginBottom: spacing.md },
  block: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    paddingBottom: 0,
    marginBottom: spacing.md,
  },
  blockHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  blockTitle: { ...typography.bodyStrong, color: colors.primary, flex: 1 },
  remove: { ...typography.label, color: colors.danger },
  twoCol: { flexDirection: 'row', gap: spacing.sm },
  col: { flex: 1 },
  warning: { ...typography.label, color: colors.danger, marginBottom: spacing.sm },
  footnote: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm },
});
