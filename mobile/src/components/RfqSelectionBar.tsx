import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from './PrimaryButton';
import type { RfqSelection } from '../features/quotes/rfqSelection';
import { colors, fonts, spacing, typography } from '../theme';

// Çoklu teklif seçimi açıkken ekranın altına sabitlenen şerit (Faz 3, Adım 1).
// Sayılan şey ürün değil FİRMA: istek firma başına tek gider.
export function RfqSelectionBar({ selection, onSubmit }: { selection: RfqSelection; onSubmit: () => void }) {
  const insets = useSafeAreaInsets();
  const { items, companyCount, hasDuplicateCompany, manyCompanies, limitNote } = selection;
  const canSubmit = companyCount >= 2;

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + 10 }]}>
      <Text style={styles.count}>
        {items.length} ürün · {companyCount} firma seçildi
      </Text>
      {!canSubmit ? <Text style={styles.hint}>En az 2 farklı firmadan ürün seçin.</Text> : null}
      {hasDuplicateCompany ? (
        <Text style={styles.hint}>Aynı firmadan yalnızca ilk seçtiğiniz ürün için istek gider.</Text>
      ) : null}
      {manyCompanies ? <Text style={styles.warn}>5'ten fazla firmaya sorunca cevap oranı düşebilir.</Text> : null}
      {limitNote ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {limitNote}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <PrimaryButton label="Vazgeç" variant="outline" size="lg" onPress={selection.cancel} />
        <PrimaryButton
          label="Teklif iste"
          size="lg"
          disabled={!canSubmit}
          onPress={onSubmit}
          style={styles.main}
          accessibilityLabel={`Teklif iste, ${companyCount} firma`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
    gap: 2,
  },
  count: { ...typography.label, fontFamily: fonts.semibold, color: colors.primary },
  hint: { ...typography.caption, color: colors.textMuted },
  warn: { ...typography.caption, color: colors.warning },
  error: { ...typography.caption, color: colors.danger },
  actions: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.sm },
  main: { flex: 1 },
});
