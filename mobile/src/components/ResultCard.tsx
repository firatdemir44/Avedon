import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, shadow, spacing, typography } from '../theme';
import type { ResultRow } from '../features/assistant/toolResult';

interface Row {
  label: string;
  value: string;
  /** Etiketin altındaki küçük gri açıklama (örn. toplam içindeki pay). */
  note?: string;
  /** Öne çıkan satır: üstünde ayırıcı çizgi, daha büyük ve kalın değer. */
  strong?: boolean;
  /** Dikkat çekilen satır (örn. en büyük maliyet kalemi): koyu etiket. */
  highlight?: boolean;
}

// Hesaplayıcı ekranlarının sonuç kutusu (tonlu zemin, etiket + değer).
export function ResultCard({ rows }: { rows: Row[] }) {
  return (
    <View style={styles.card}>
      {rows.map((row) => (
        <View key={row.label} style={[styles.row, row.strong && styles.rowStrong]}>
          <View style={styles.rowTexts}>
            <Text style={[styles.label, (row.strong || row.highlight) && styles.labelStrong]}>{row.label}</Text>
            {row.note ? <Text style={styles.note}>{row.note}</Text> : null}
          </View>
          <Text style={[styles.value, row.strong && styles.valueStrong]}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

// Asistan sohbetindeki araç sonucu kartı (taslak: docs/tasarim-2027/Asistan.dc.html).
// Beyaz kutunun içinde kesik çizgili iç çerçeve, üstte küçük gri büyük harfli
// başlık, sağda birim; altında satırlar. Karttaki her rakam ARAÇ ÇIKTISINDAN
// gelir (model metninden değil) — bkz. features/assistant/toolResult.ts.
export function AssistantResultCard({
  title,
  unit,
  rows,
  text,
  formula,
}: {
  title: string;
  unit?: string;
  rows: ResultRow[];
  text?: string;
  formula?: string;
}) {
  const [openFormula, setOpenFormula] = useState(false);

  return (
    <View style={styles.toolCard}>
      <View style={styles.toolInner}>
        <View style={styles.toolHeader}>
          <Text style={styles.toolTitle} accessibilityRole="header">
            {title.toLocaleUpperCase('tr-TR')}
          </Text>
          {unit ? <Text style={styles.toolUnit}>{unit}</Text> : null}
        </View>
        {rows.map((row, index) => (
          <View key={`${row.label}-${index}`} style={[styles.toolRow, row.strong && styles.toolRowStrong]}>
            <View style={styles.toolRowTexts}>
              <Text style={[styles.toolLabel, row.strong && styles.toolLabelStrong]}>{row.label}</Text>
              {row.note ? <Text style={styles.toolNote}>{row.note}</Text> : null}
            </View>
            <Text style={[styles.toolValue, row.strong && styles.toolValueStrong]}>{row.value}</Text>
          </View>
        ))}
        {rows.length === 0 && text ? <Text style={styles.toolText}>{text}</Text> : null}
      </View>
      {formula ? (
        <Pressable
          onPress={() => setOpenFormula((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: openFormula }}
          accessibilityLabel={`Nasıl hesaplandı, ${openFormula ? 'kapat' : 'aç'}`}
          style={({ pressed }) => [styles.formulaToggle, pressed && styles.formulaPressed]}
        >
          <Text style={styles.formulaToggleText}>Nasıl hesaplandı</Text>
          <Ionicons name={openFormula ? 'chevron-up' : 'chevron-down'} size={14} color={colors.chevron} />
        </Pressable>
      ) : null}
      {formula && openFormula ? <Text style={styles.formulaText}>{formula}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceTonal,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
    ...shadow.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  rowStrong: {
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
  },
  rowTexts: { flexShrink: 1 },
  label: {
    ...typography.body,
    color: colors.textMuted,
  },
  labelStrong: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  note: {
    ...typography.caption,
    color: colors.textMuted,
  },
  value: {
    ...typography.bodyStrong,
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  valueStrong: {
    fontFamily: fonts.monoSemibold,
    fontSize: 19,
    lineHeight: 25,
  },
  toolCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 4,
  },
  toolInner: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderStyle: 'dashed',
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: spacing.sm,
  },
  toolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingBottom: 6,
  },
  toolTitle: {
    fontFamily: fonts.medium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.5,
    color: colors.textMuted,
    flexShrink: 1,
  },
  toolUnit: { fontFamily: fonts.mono, fontSize: 11, lineHeight: 15, color: colors.textMuted },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: 32,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  toolRowStrong: { borderTopColor: colors.borderStrong, minHeight: 38 },
  toolRowTexts: { flexShrink: 1 },
  toolLabel: { ...typography.caption, fontSize: 14, lineHeight: 19, color: colors.text },
  toolLabelStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  toolNote: { ...typography.caption, fontSize: 11, lineHeight: 15, color: colors.textMuted },
  toolValue: { fontFamily: fonts.mono, fontSize: 14, lineHeight: 19, color: colors.text },
  toolValueStrong: { fontFamily: fonts.monoSemibold, fontSize: 17, lineHeight: 23, color: colors.primary },
  toolText: { ...typography.caption, fontSize: 14, lineHeight: 19, color: colors.text, paddingTop: 2 },
  formulaToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  formulaPressed: { opacity: 0.6 },
  formulaToggleText: { ...typography.caption, fontSize: 12, color: colors.textMuted },
  formulaText: {
    ...typography.caption,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
    paddingHorizontal: 6,
    paddingBottom: spacing.sm,
  },
});
