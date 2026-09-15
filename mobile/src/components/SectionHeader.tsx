import React from 'react';
import { Text, StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { colors, fonts, spacing, typography } from '../theme';

// Beyaz blokların üstündeki küçük gri bölüm başlığı ("Çalışanlar", "Maliyet").
// `count` verilirse eşit aralıklı yazıyla parantez içinde: "Ürünler (12)".
export function SectionHeader({
  title,
  count,
  first,
  style,
}: {
  title: string;
  count?: number;
  // Ekranın en üstündeki başlıkta üst boşluk daha az.
  first?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={[styles.header, first && styles.first, style]} accessibilityRole="header">
      {title}
      {count !== undefined ? <Text style={styles.count}> ({count})</Text> : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  header: {
    ...typography.label,
    fontFamily: fonts.semibold,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
    paddingBottom: 6,
  },
  first: { paddingTop: 12 },
  count: { fontFamily: fonts.monoMedium },
});
