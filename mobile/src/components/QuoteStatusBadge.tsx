import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { QuoteRequestStatus } from '../api/client';
import { colors, fonts, radius, spacing, typography } from '../theme';

// Teklif isteğinin durum rozeti (Faz 2, Adım 2); desen SampleStatusBadge ile
// aynı. Numune rozetinden farklı olarak metin sunucudan gelmiyor (teklif
// yanıtında durum etiketi yok), bu yüzden eşleme burada.
const TONES: Record<QuoteRequestStatus, { label: string; background: string; text: string }> = {
  open: { label: 'Teklif bekleniyor', background: colors.accentSoft, text: colors.primary },
  quoted: { label: 'Teklif verildi', background: colors.warningSoft, text: colors.warning },
  accepted: { label: 'Kabul edildi', background: colors.successSoft, text: colors.success },
  declined: { label: 'Reddedildi', background: colors.dangerSoft, text: colors.danger },
  cancelled: { label: 'Geri çekildi', background: colors.chip, text: colors.textMuted },
};

export function quoteStatusLabel(status: QuoteRequestStatus): string {
  return (TONES[status] ?? TONES.open).label;
}

export function QuoteStatusBadge({ status }: { status: QuoteRequestStatus }) {
  const tone = TONES[status] ?? TONES.open;
  return (
    <View style={[styles.badge, { backgroundColor: tone.background }]} accessibilityLabel={`Durum: ${tone.label}`}>
      <Text style={[styles.text, { color: tone.text }]} numberOfLines={1}>
        {tone.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  text: { ...typography.caption, fontFamily: fonts.semibold },
});
