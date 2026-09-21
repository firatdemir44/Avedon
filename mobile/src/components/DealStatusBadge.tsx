import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { DealStatus } from '../api/client';
import { colors, fonts, radius, spacing, typography } from '../theme';

// Sipariş kaydının durum rozeti (Faz 3, Adım 4); desen QuoteStatusBadge ile
// aynı. Metin sunucudan gelmiyor, eşleme burada. Renk tek başına anlam
// taşımaz: yanında hep metin var.
const TONES: Record<DealStatus, { label: string; background: string; text: string }> = {
  acik: { label: 'Açık', background: colors.accentSoft, text: colors.primary },
  teslim_bildirildi: { label: 'Teslim bildirildi', background: colors.warningSoft, text: colors.warning },
  teslim_edildi: { label: 'Teslim edildi', background: colors.successSoft, text: colors.success },
  itiraz: { label: 'İtiraz var', background: colors.dangerSoft, text: colors.danger },
  iptal: { label: 'İptal', background: colors.chip, text: colors.textMuted },
};

export function dealStatusLabel(status: DealStatus): string {
  return (TONES[status] ?? TONES.acik).label;
}

export function DealStatusBadge({ status }: { status: DealStatus }) {
  const tone = TONES[status] ?? TONES.acik;
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
