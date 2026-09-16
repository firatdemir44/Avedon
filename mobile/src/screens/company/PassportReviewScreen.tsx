import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import type { ExtractionFieldName } from '../../api/client';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SectionHeader } from '../../components/SectionHeader';
import {
  AUTO_SELECT_CONFIDENCE,
  CERTAIN_CONFIDENCE,
  EXTRACTION_FIELDS,
  FIELD_LABELS,
  REJECT_REASON_LABELS,
  buildPassportImport,
  formatFieldValue,
  hasValue,
} from '../../features/products/passportImport';
import { haptics } from '../../features/haptics';
import { colors, fonts, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'PassportReview'>;

// Güven rozeti: yüksekse etikette birebir yazıyor, ortadaysa kontrol edilmeli,
// düşükse şüpheli (varsayılan olarak işaretsiz gelir).
function confidenceBadge(confidence: number) {
  if (confidence >= CERTAIN_CONFIDENCE) return { label: 'Etikette yazıyor', style: styles.badgeSure };
  if (confidence >= AUTO_SELECT_CONFIDENCE) return { label: 'Kontrol edin', style: styles.badgeCheck };
  return { label: 'Şüpheli', style: styles.badgeDoubt };
}

// Etiketten okunanların onay ekranı (Faz 1, Adım 3). Hiçbir şey kaydetmez:
// işaretli alanlar ürün formuna aktarılır, kullanıcı formu normal kaydeder.
export function PassportReviewScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { productId, outcome } = route.params;
  const { extraction, warnings, rejected, meta } = outcome;

  const readFields = useMemo(
    () => EXTRACTION_FIELDS.filter((field) => hasValue(extraction, field)),
    [extraction]
  );
  const missingFields = useMemo(
    () => EXTRACTION_FIELDS.filter((field) => !hasValue(extraction, field)),
    [extraction]
  );

  // Varsayılan: güveni eşiğin üstünde olanlar işaretli.
  const [selected, setSelected] = useState<ExtractionFieldName[]>(() =>
    readFields.filter((field) => extraction[field].confidence >= AUTO_SELECT_CONFIDENCE)
  );

  const toggle = (field: ExtractionFieldName) => {
    haptics.selection();
    setSelected((prev) => (prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]));
  };

  const transfer = () => {
    const order = readFields.filter((field) => selected.includes(field));
    const passportImport = buildPassportImport(extraction, order);
    // Form ekranı yığında ayakta: popTo ile ona GERİ dönülüyor (React Navigation
    // 7'de navigate geri gitmez, formun ikinci kopyasını açar), merge ile
    // girilen diğer bilgiler (fotoğraf, stok, fiyat) korunuyor.
    navigation.popTo('AddProduct', { productId, passportImport, importKey: Date.now() }, { merge: true });
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.introBlock}>
          <Text style={styles.intro}>
            Etiketten okunanlar. İşaretli alanlar forma aktarılır; sonra düzenleyebilirsiniz.
          </Text>
          {meta.mock ? <Text style={styles.mockNote}>Test kipi: gerçek model çağrılmadı.</Text> : null}
        </View>

        {warnings.notes.length ? (
          <View style={styles.warningBox} accessibilityRole="alert">
            <View style={styles.warningTitleRow}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
              <Text style={styles.warningTitle}>Dikkat</Text>
            </View>
            {warnings.notes.map((note) => (
              <Text key={note} style={styles.warningNote}>
                {note}
              </Text>
            ))}
          </View>
        ) : null}

        <SectionHeader title="Okunan alanlar" count={readFields.length} />
        <View style={styles.block}>
          {readFields.length === 0 ? (
            <Text style={styles.emptyNote}>Etiketten hiçbir alan okunamadı. Bilgileri elle girebilirsiniz.</Text>
          ) : null}
          {readFields.map((field, index) => {
            const checked = selected.includes(field);
            const badge = confidenceBadge(extraction[field].confidence);
            const evidence = extraction[field].evidence;
            return (
              <Pressable
                key={field}
                onPress={() => toggle(field)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                // react-native-web accessibilityState.checked'i aria-checked'e
                // çevirmiyor; ekran okuyucu seçimi duysun.
                aria-checked={checked}
                accessibilityLabel={`${FIELD_LABELS[field]}, ${formatFieldValue(extraction, field)}, ${badge.label}`}
                style={({ pressed }) => [
                  styles.fieldRow,
                  index < readFields.length - 1 && styles.rowDivider,
                  pressed && styles.rowPressed,
                ]}
              >
                <Ionicons
                  name={checked ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={checked ? colors.primary : colors.chevron}
                  style={styles.checkbox}
                />
                <View style={styles.fieldBody}>
                  <View style={styles.fieldHead}>
                    <Text style={styles.fieldName}>{FIELD_LABELS[field]}</Text>
                    <Text style={[styles.badge, badge.style]}>{badge.label}</Text>
                  </View>
                  <Text style={isMonoField(field) ? styles.fieldValueMono : styles.fieldValue}>
                    {formatFieldValue(extraction, field)}
                  </Text>
                  {evidence ? <Text style={styles.evidence}>Okunan: {evidence}</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        {missingFields.length ? (
          <View style={styles.missingBlock}>
            <Text style={styles.missingText}>
              Bulunamadı: {missingFields.map((field) => FIELD_LABELS[field]).join(', ')}
            </Text>
          </View>
        ) : null}

        {rejected.length ? (
          <>
            <SectionHeader title="Okundu ama aktarılmadı" count={rejected.length} />
            <View style={styles.block}>
              {rejected.map((item, index) => (
                <View
                  key={`${item.field}-${item.raw}-${index}`}
                  style={[styles.rejectedRow, index < rejected.length - 1 && styles.rowDivider]}
                >
                  <Text style={styles.rejectedRaw}>{item.raw}</Text>
                  <Text style={styles.rejectedReason}>{REJECT_REASON_LABELS[item.reason] ?? item.reason}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {extraction.notes.trim() ? (
          <>
            <SectionHeader title="Notlar" />
            <View style={styles.block}>
              <Text style={styles.notes}>{extraction.notes.trim()}</Text>
            </View>
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 10 }]}>
        <PrimaryButton
          label="Vazgeç"
          variant="outline"
          size="lg"
          onPress={() => navigation.goBack()}
          style={styles.actionSecondary}
        />
        <PrimaryButton
          label={`Forma aktar (${selected.length})`}
          size="lg"
          disabled={selected.length === 0}
          onPress={transfer}
          style={styles.actionMain}
        />
      </View>
    </View>
  );
}

// Sayı ve kod alanları eşit aralıklı yazıyla (Pazar Masası kuralı).
function isMonoField(field: ExtractionFieldName) {
  return field === 'code' || field === 'weightGsm' || field === 'widthCm' || field === 'yarns';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  block: { backgroundColor: colors.surface },
  introBlock: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm + 2,
    gap: 4,
  },
  intro: { ...typography.body, color: colors.text },
  mockNote: { ...typography.caption, color: colors.textMuted },
  // Sunucu uyarıları: ürün formundaki "Kaydedildi. Dikkat:" kutusuyla aynı.
  warningBox: {
    backgroundColor: colors.warningSoft,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.blockGap,
    gap: 4,
  },
  warningTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  warningTitle: { ...typography.label, fontFamily: fonts.semibold, color: colors.warning },
  warningNote: { ...typography.caption, color: colors.text },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm + 2,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowPressed: { backgroundColor: colors.pressed },
  checkbox: { marginTop: 2 },
  fieldBody: { flex: 1, gap: 2 },
  fieldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  fieldName: { ...typography.label, fontFamily: fonts.semibold, color: colors.textMuted, flexShrink: 1 },
  badge: {
    ...typography.caption,
    fontFamily: fonts.medium,
    fontSize: 11,
    lineHeight: 15,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  badgeSure: { backgroundColor: colors.successSoft, color: colors.success },
  badgeCheck: { backgroundColor: colors.warningSoft, color: colors.warning },
  badgeDoubt: { backgroundColor: colors.dangerSoft, color: colors.danger },
  fieldValue: { ...typography.body, color: colors.text },
  fieldValueMono: { ...typography.mono, color: colors.text },
  evidence: { ...typography.caption, color: colors.textMuted },
  emptyNote: {
    ...typography.body,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.md,
  },
  missingBlock: { paddingHorizontal: spacing.gutter, paddingTop: spacing.sm },
  missingText: { ...typography.caption, color: colors.textMuted },
  rejectedRow: {
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm + 2,
    gap: 2,
  },
  rejectedRaw: { ...typography.body, color: colors.text },
  rejectedReason: { ...typography.caption, color: colors.textMuted },
  notes: {
    ...typography.body,
    color: colors.text,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm + 2,
  },
  actionBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.gutter,
    paddingTop: 10,
  },
  actionSecondary: { flex: 1 },
  actionMain: { flex: 2 },
});
