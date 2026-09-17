import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import { ApiError, MAX_RFQ_COMPANIES, createRfq, type RfqSkipped } from '../../api/client';
import { ChipSelect } from '../../components/ChipSelect';
import { TextField } from '../../components/TextField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { InlineError, friendlyMessage } from '../../components/StateView';
import { STOCK_UNITS, STOCK_UNIT_LABELS, isYarnType, type StockUnit } from '../../features/products/catalog';
import { parseNumber } from '../../features/calculators/parse';
import { DATE_PATTERN } from '../../features/quotes/format';
import { companyCountOf, type RfqSelectionItem } from '../../features/quotes/rfqSelection';
import { haptics } from '../../features/haptics';
import { colors, fonts, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'RfqForm'>;

const UNIT_OPTIONS = STOCK_UNITS.map((unit) => ({ value: unit, label: STOCK_UNIT_LABELS[unit].long }));

const SKIP_REASONS: Record<string, string> = {
  not_found: 'ürün bulunamadı',
  own_product: 'kendi firmanızın ürünü',
  same_company: 'aynı firmadan başka ürün seçilmişti',
  already_open: 'bu ürün için zaten açık isteğiniz var',
};

// Faz 3, Adım 1: tek üründe kalan teklif isteğinin çoklu hali. Aynı ihtiyaç
// birkaç firmaya birden sorulur; istek FİRMA başına tek gider.
export function RfqFormScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<RfqSelectionItem[]>(route.params.items);
  // Hepsi iplikse kg, aksi halde metre.
  const [unit, setUnit] = useState<StockUnit>(
    route.params.items.length > 0 && route.params.items.every((i) => isYarnType(i.type) || i.stockUnit === 'kg')
      ? 'kg'
      : 'm'
  );
  const [quantity, setQuantity] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [note, setNote] = useState('');
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Gönderildi ama bir kısmı atlandı: nedenleri gösterip kullanıcıyı
  // karşılaştırmaya kendisi geçirsin (sessizce atlamak yanıltıcı olurdu).
  const [result, setResult] = useState<{ rfqId: string; skipped: RfqSkipped[] } | null>(null);

  const companyCount = companyCountOf(items);
  const quantityValue = parseNumber(quantity);
  const dateInvalid = !!targetDate.trim() && !DATE_PATTERN.test(targetDate.trim());
  const canSubmit = quantityValue > 0 && companyCount >= 2 && !dateInvalid && !submitting && !result;

  const codeOf = (productId: string) => items.find((i) => i.id === productId)?.code ?? 'Ürün';

  const openCompare = (rfqId: string) => {
    // replace: geri tuşu doldurulmuş forma dönmesin.
    navigation.replace('RfqCompare', { rfqId });
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { rfq, skipped } = await createRfq({
        productIds: items.map((i) => i.id),
        quantity: quantityValue,
        unit,
        targetDate: targetDate.trim() ? targetDate.trim() : null,
        note: note.trim() || undefined,
        title: title.trim() || undefined,
      });
      haptics.success();
      if (skipped.length === 0) {
        openCompare(rfq.id);
        return;
      }
      setResult({ rfqId: rfq.id, skipped });
      setSubmitting(false);
    } catch (err) {
      haptics.error();
      const apiError = err instanceof ApiError ? err : null;
      if (apiError?.code === 'need_two_companies') {
        setError('En az 2 farklı firmadan ürün gerekiyor. Seçtikleriniz aynı firmadan ya da size ait olabilir.');
      } else if (apiError?.code === 'too_many_companies') {
        setError(`En çok ${MAX_RFQ_COMPANIES} firmaya sorabilirsiniz. Birkaç ürünü listeden çıkarın.`);
      } else if (apiError?.code === 'daily_limit') {
        const remaining = typeof apiError.body?.remaining === 'number' ? apiError.body.remaining : 0;
        setError(
          remaining > 0
            ? `Günlük teklif isteği sınırına yaklaştınız; bugün ${remaining} istek hakkınız kaldı.`
            : 'Günlük teklif isteği sınırına ulaştınız. Yarın tekrar deneyin.'
        );
      } else {
        setError(friendlyMessage(err, 'Teklif isteği gönderilemedi'));
      }
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.block}>
          <Text style={styles.lead}>
            Aynı ihtiyacı {companyCount} firmaya birden soruyorsunuz. Her firmaya tek istek gider; gelen teklifleri
            tek tabloda karşılaştırırsınız.
          </Text>
        </View>

        <View style={styles.block}>
          <Text style={styles.sectionTitle}>Seçilen ürünler ({items.length})</Text>
          {items.map((item, index) => (
            <View key={item.id} style={[styles.itemRow, index < items.length - 1 && styles.itemDivider]}>
              <View style={styles.itemTexts}>
                <Text style={styles.itemCode} numberOfLines={1}>
                  {item.code}
                </Text>
                <Text style={styles.itemCompany} numberOfLines={1}>
                  {item.companyName}
                </Text>
              </View>
              <Pressable
                onPress={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`${item.code} ürününü listeden çıkar`}
                style={({ pressed }) => [styles.removeButton, pressed && styles.pressedFade]}
              >
                <Ionicons name="close" size={20} color={colors.danger} />
              </Pressable>
            </View>
          ))}
          {companyCount < 2 ? (
            <Text style={styles.itemWarn}>En az 2 farklı firmadan ürün gerekiyor.</Text>
          ) : null}
        </View>

        <View style={styles.block}>
          <View style={styles.formBody}>
            <TextField
              label="Miktar"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="decimal-pad"
              placeholder="Örn. 1500"
            />
            <Text style={styles.fieldLabel}>Birim</Text>
            <ChipSelect options={UNIT_OPTIONS} value={unit} onChange={setUnit} />

            <TextField
              label="İstenen termin tarihi (YYYY-AA-GG, isteğe bağlı)"
              value={targetDate}
              onChangeText={setTargetDate}
              placeholder="2026-11-15"
              autoCapitalize="none"
            />
            {dateInvalid ? (
              <Text style={styles.fieldError}>Tarihi YYYY-AA-GG biçiminde yazın (örn. 2026-11-15).</Text>
            ) : null}

            <TextField
              label="Not (isteğe bağlı)"
              value={note}
              onChangeText={setNote}
              placeholder="Örn. Ekru, ilk parti 500 m olabilir"
              multiline
            />
            <TextField
              label="Başlık (isteğe bağlı)"
              value={title}
              onChangeText={setTitle}
              placeholder="Örn. Yazlık süprem alımı"
            />
            <Text style={styles.privacyNote}>
              Satıcılar başka kaç firmaya sorduğunuzu görmez; onlara normal bir teklif isteği olarak düşer.
            </Text>
          </View>
        </View>

        {result ? (
          <View style={styles.block}>
            <View style={styles.skipBox} accessibilityRole="alert">
              <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
              <View style={styles.skipTexts}>
                <Text style={styles.skipTitle}>Bazı ürünler için istek gönderilmedi:</Text>
                {result.skipped.map((s) => (
                  <Text key={s.productId} style={styles.skipText}>
                    {codeOf(s.productId)} — {SKIP_REASONS[s.reason] ?? 'gönderilemedi'}
                  </Text>
                ))}
              </View>
            </View>
          </View>
        ) : null}

        {error ? (
          <View style={styles.bannerWrap}>
            <InlineError message={error} />
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 10 }]}>
        {result ? (
          <PrimaryButton
            label="Karşılaştırmayı aç"
            size="lg"
            onPress={() => openCompare(result.rfqId)}
            style={styles.actionMain}
          />
        ) : (
          <PrimaryButton
            label={submitting ? 'Gönderiliyor...' : `Teklif iste (${companyCount} firma)`}
            size="lg"
            disabled={!canSubmit}
            onPress={submit}
            style={styles.actionMain}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { gap: spacing.blockGap, paddingBottom: spacing.xl },
  block: { backgroundColor: colors.surface, paddingVertical: spacing.sm },
  lead: {
    ...typography.label,
    fontFamily: fonts.regular,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
  },
  sectionTitle: {
    ...typography.label,
    fontFamily: fonts.semibold,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingBottom: 6,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.gutter,
  },
  itemDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  itemTexts: { flex: 1, minWidth: 0 },
  itemCode: { ...typography.mono, fontFamily: fonts.monoSemibold, color: colors.primary },
  itemCompany: { ...typography.caption, color: colors.accent },
  removeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  pressedFade: { opacity: 0.6 },
  itemWarn: { ...typography.caption, color: colors.danger, paddingHorizontal: spacing.gutter, paddingTop: 6 },
  formBody: { paddingHorizontal: spacing.gutter, paddingTop: spacing.sm },
  fieldLabel: { ...typography.label, color: colors.text, marginBottom: spacing.xs, marginLeft: spacing.sm },
  fieldError: { ...typography.caption, color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm },
  privacyNote: { ...typography.caption, color: colors.textMuted, paddingBottom: spacing.sm },
  skipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginHorizontal: spacing.gutter,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: spacing.sm,
  },
  skipTexts: { flex: 1, gap: 2 },
  skipTitle: { ...typography.caption, fontFamily: fonts.semibold, color: colors.warning },
  skipText: { ...typography.caption, color: colors.warning },
  bannerWrap: { paddingHorizontal: spacing.gutter },
  actionBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.gutter,
    paddingTop: 10,
  },
  actionMain: { width: '100%' },
});
