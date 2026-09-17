import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from '../PrimaryButton';
import type { RfqCandidatesView, RfqSummaryView } from '../../features/assistant/toolResult';
import { companyCountOf, type RfqSelectionItem } from '../../features/quotes/rfqSelection';
import { haptics } from '../../features/haptics';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

// Faz 3, Adım 2: asistanın teklif kartları. Hafıza / izleme kartlarının görsel
// dili (beyaz kutu, ince çerçeve) ama içinde seçim var.
//
// KURAL: asistan teklif isteğini KENDİSİ GÖNDERMEZ. Kart yalnızca aday önerir;
// istek, kullanıcı forma geçip onayladığında gider.

export function RfqCandidatesCard({
  view,
  onOpenProduct,
  onRequest,
}: {
  view: RfqCandidatesView;
  onOpenProduct: (productId: string) => void;
  onRequest: (items: RfqSelectionItem[], prefill: RfqCandidatesView['request']) => void;
}) {
  // Varsayılan: hepsi işaretli. Eski mesajlarda kart yeniden çizilince de
  // aynı şekilde kurulur (seçim sunucuda tutulmuyor, ekranda yaşıyor).
  const [selected, setSelected] = useState<string[]>(() => view.candidates.map((c) => c.id));

  const chosen = view.candidates.filter((c) => selected.includes(c.id));
  const items: RfqSelectionItem[] = chosen.map((c) => ({
    id: c.id,
    code: c.code,
    companyId: c.companyId,
    companyName: c.companyName,
    stockUnit: c.stockUnit,
    type: c.type,
  }));
  const companyCount = companyCountOf(items);
  const canRequest = companyCount >= 2;

  const toggle = (id: string) => {
    haptics.selection();
    setSelected((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">
        Teklif toplama adayları
      </Text>

      {view.candidates.map((candidate, index) => {
        const isSelected = selected.includes(candidate.id);
        return (
          <View
            key={candidate.id}
            style={[styles.row, index < view.candidates.length - 1 && styles.rowDivider]}
          >
            {/* Onay kutusu ve "Ürünü aç" KARDEŞ düğmeler: web'de iç içe buton olmasın. */}
            <Pressable
              onPress={() => toggle(candidate.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`${candidate.code}, ${candidate.companyName}, ${candidate.summary}`}
              style={({ pressed }) => [styles.rowMain, pressed && styles.rowPressed]}
            >
              <Ionicons
                name={isSelected ? 'checkbox' : 'square-outline'}
                size={20}
                color={isSelected ? colors.primary : colors.borderStrong}
              />
              <View style={styles.rowTexts}>
                <View style={styles.rowHead}>
                  <Text style={styles.code} numberOfLines={1}>
                    {candidate.code}
                  </Text>
                  <Text style={styles.company} numberOfLines={1}>
                    {candidate.companyName}
                  </Text>
                  {candidate.verified ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={13}
                      color={colors.accent}
                      accessibilityLabel="Doğrulanmış firma"
                    />
                  ) : null}
                </View>
                {candidate.summary ? (
                  <Text style={styles.summary} numberOfLines={2}>
                    {candidate.summary}
                  </Text>
                ) : null}
              </View>
            </Pressable>
            <Pressable
              onPress={() => onOpenProduct(candidate.id)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`${candidate.code} ürününü aç`}
              style={({ pressed }) => [styles.openLink, pressed && styles.pressedFade]}
            >
              <Text style={styles.openLinkText}>Ürünü aç</Text>
            </Pressable>
          </View>
        );
      })}

      <PrimaryButton
        label={`Seçilenlerden teklif iste (${companyCount} firma)`}
        size="sm"
        disabled={!canRequest}
        onPress={() => onRequest(items, view.request)}
        style={styles.action}
      />
      {!canRequest ? <Text style={styles.warn}>En az 2 firma seçin.</Text> : null}
      <Text style={styles.note}>
        İstek siz onaylamadan gitmez. Satıcılar başka kaç firmaya sorduğunuzu görmez.
      </Text>
    </View>
  );
}

// "N firmaya soruldu · M teklif geldi" + karşılaştırma bağlantısı.
export function RfqSummaryCard({ view, onOpen }: { view: RfqSummaryView; onOpen: (rfqId: string) => void }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">
        {view.title}
      </Text>
      <Text style={styles.counts}>
        {view.requestCount} firmaya soruldu · {view.quotedCount} teklif geldi
      </Text>
      <Pressable
        onPress={() => onOpen(view.rfqId)}
        accessibilityRole="button"
        accessibilityLabel={`${view.title} karşılaştırmasını aç`}
        style={({ pressed }) => [styles.compareLink, pressed && styles.rowPressed]}
      >
        <Text style={styles.compareText}>Karşılaştırmayı aç</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    gap: 4,
  },
  title: { ...typography.label, fontFamily: fonts.semibold, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH,
    paddingVertical: 6,
  },
  rowPressed: { backgroundColor: colors.pressed },
  pressedFade: { opacity: 0.6 },
  rowTexts: { flex: 1, minWidth: 0, gap: 1 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  code: { ...typography.mono, fontFamily: fonts.monoSemibold, fontSize: 14, color: colors.primary, flexShrink: 0 },
  company: { ...typography.caption, fontFamily: fonts.medium, color: colors.accent, flexShrink: 1 },
  summary: { ...typography.caption, fontSize: 11, lineHeight: 15, color: colors.textMuted },
  openLink: { minHeight: MIN_TOUCH, justifyContent: 'center', paddingLeft: spacing.xs },
  openLinkText: { ...typography.caption, fontFamily: fonts.semibold, color: colors.primary },
  action: { marginTop: spacing.sm },
  warn: { ...typography.caption, color: colors.textMuted },
  note: { ...typography.caption, fontSize: 11, lineHeight: 15, color: colors.textMuted, marginTop: 2 },
  counts: { ...typography.caption, fontSize: 14, lineHeight: 19, color: colors.text },
  compareLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    minHeight: MIN_TOUCH,
    paddingRight: 6,
  },
  compareText: { ...typography.label, fontFamily: fonts.semibold, color: colors.primary },
});
