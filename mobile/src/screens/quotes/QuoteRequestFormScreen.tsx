import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackScreenProps } from '../../navigation/types';
import { ApiError, createQuoteRequest } from '../../api/client';
import { ChipSelect } from '../../components/ChipSelect';
import { TextField } from '../../components/TextField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { InlineError, friendlyMessage } from '../../components/StateView';
import { STOCK_UNITS, STOCK_UNIT_LABELS, type StockUnit } from '../../features/products/catalog';
import { parseNumber } from '../../features/calculators/parse';
import { DATE_PATTERN } from '../../features/quotes/format';
import { haptics } from '../../features/haptics';
import { colors, fonts, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'QuoteRequestForm'>;

const UNIT_OPTIONS = STOCK_UNITS.map((unit) => ({ value: unit, label: STOCK_UNIT_LABELS[unit].long }));

// Faz 2, Adım 2: eski "Teklif iste" sohbet açıyordu; artık gerçek bir istek
// formu. Bağlantı şartı YOK (Fırat'ın kararı 2026-09-17), istek doğrudan
// satıcı firmaya düşer.
export function QuoteRequestFormScreen({ route, navigation }: Props) {
  const { productId, productCode, stockUnit } = route.params;
  const insets = useSafeAreaInsets();
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<StockUnit>(stockUnit === 'kg' ? 'kg' : 'm');
  const [targetDate, setTargetDate] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 409 already_open: aynı ürüne açık isteği var, ikincisi açılmaz.
  const [existingId, setExistingId] = useState<string | null>(null);

  const quantityValue = parseNumber(quantity);
  const dateInvalid = !!targetDate.trim() && !DATE_PATTERN.test(targetDate.trim());
  const canSubmit = quantityValue > 0 && !dateInvalid && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setExistingId(null);
    try {
      const { request } = await createQuoteRequest({
        productId,
        quantity: quantityValue,
        unit,
        targetDate: targetDate.trim() ? targetDate.trim() : null,
        note: note.trim() || undefined,
      });
      haptics.success();
      // replace: geri tuşu doldurulmuş forma dönmesin.
      navigation.replace('QuoteRequestDetail', { requestId: request.id });
    } catch (err) {
      haptics.error();
      const apiError = err instanceof ApiError ? err : null;
      if (apiError?.code === 'already_open') {
        const requestId = typeof apiError.body?.requestId === 'string' ? apiError.body.requestId : null;
        setExistingId(requestId);
        setError('Bu ürün için zaten açık bir teklif isteğiniz var.');
      } else if (apiError?.code === 'own_product') {
        setError('Kendi firmanızın ürününe teklif isteyemezsiniz.');
      } else if (apiError?.code === 'product_not_found') {
        setError('Ürün bulunamadı, kaldırılmış olabilir.');
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
          <Text style={styles.code}>{productCode}</Text>
          <Text style={styles.lead}>Ne kadar ve ne zaman istediğinizi yazın; satıcı firma teklifini hazırlayıp gönderir.</Text>
        </View>

        <View style={styles.block}>
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
        </View>

        {error ? (
          <View style={styles.bannerWrap}>
            <InlineError message={error} />
            {existingId ? (
              <PrimaryButton
                label="Mevcut isteğe git"
                variant="outline"
                onPress={() => navigation.replace('QuoteRequestDetail', { requestId: existingId })}
                style={styles.existingButton}
              />
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 10 }]}>
        <PrimaryButton
          label={submitting ? 'Gönderiliyor...' : 'Teklif iste'}
          size="lg"
          disabled={!canSubmit}
          onPress={submit}
          style={styles.actionMain}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { gap: spacing.blockGap, paddingBottom: spacing.xl },
  block: { backgroundColor: colors.surface, paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: spacing.xs },
  code: { fontFamily: fonts.monoSemibold, fontSize: 20, lineHeight: 26, color: colors.primary },
  lead: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted, marginTop: 2, marginBottom: spacing.sm },
  fieldLabel: { ...typography.label, color: colors.text, marginBottom: spacing.xs, marginLeft: spacing.sm },
  fieldError: { ...typography.caption, color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm },
  bannerWrap: { paddingHorizontal: spacing.gutter, gap: spacing.sm },
  existingButton: { alignSelf: 'flex-start' },
  actionBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.gutter,
    paddingTop: 10,
  },
  actionMain: { width: '100%' },
});
