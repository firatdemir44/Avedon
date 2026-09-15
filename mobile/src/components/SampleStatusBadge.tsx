import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { SampleRequestStatus } from '../types';
import { colors, fonts, radius, spacing, typography } from '../theme';

// Numune talebinin durum rozeti; takip ekranı, Taleplerim ve Gelen Talepler
// ortak kullanır. Renk anlamlı (taslak CTakip.dc.html'de "Hazırlandı" turuncu):
//   talep edildi → mavi (yeni) · onaylandı / hazırlandı → turuncu (süreç sürüyor)
//   teslim edildi → yeşil (tamam)
// Metin sunucudan gelir: son adımın adı teslimat moduna göre değişiyor
// ("Teslim Edildi" / "Kurye Teslim Aldı"), istemcide ikinci eşleme tutulmuyor.
const TONES: Record<SampleRequestStatus, { background: string; text: string }> = {
  talep_edildi: { background: colors.accentSoft, text: colors.primary },
  onaylandi: { background: colors.warningSoft, text: colors.warning },
  hazirlandi: { background: colors.warningSoft, text: colors.warning },
  teslim_edildi: { background: colors.successSoft, text: colors.success },
};

export function SampleStatusBadge({ status, label }: { status: SampleRequestStatus; label: string }) {
  const tone = TONES[status] ?? TONES.talep_edildi;
  return (
    <View style={[styles.badge, { backgroundColor: tone.background }]} accessibilityLabel={`Durum: ${label}`}>
      <Text style={[styles.text, { color: tone.text }]} numberOfLines={1}>
        {label}
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
