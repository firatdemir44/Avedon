import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { formatMeasure } from '../features/calculators/parse';
import { colors, fonts, radius, spacing, typography } from '../theme';

// Bu metrajın altındaki stok "azalıyor" sayılır: turuncu nokta ve yazı.
// Taslakta 60 m turuncu, 540 m ve üstü yeşil gösteriliyordu; numune ve küçük
// sipariş için 100 m makul bir alt sınır. Ürün bazında eşik gelirse burası değişir.
export const LOW_STOCK_METERS = 100;

export function isLowStock(stock: number) {
  return stock < LOW_STOCK_METERS;
}

export function StockDot({ stock }: { stock: number }) {
  return <View style={[styles.dot, { backgroundColor: isLowStock(stock) ? colors.warningDot : colors.success }]} />;
}

// Satır içi: "● 1.200 m" (eşit aralıklı yazı).
export function StockValue({ stock, style }: { stock: number; style?: StyleProp<ViewStyle> }) {
  const low = isLowStock(stock);
  return (
    <View
      style={[styles.inline, style]}
      accessibilityLabel={`Stok ${formatMeasure(stock)} metre${low ? ', azalıyor' : ''}`}
    >
      <StockDot stock={stock} />
      <Text style={[styles.value, low && styles.valueLow]}>{formatMeasure(stock)} m</Text>
    </View>
  );
}

// Ürün sayfasının başındaki durum rozeti: "● Stokta" / "● Az stok".
export function StockBadge({ stock }: { stock: number }) {
  const low = isLowStock(stock);
  return (
    <View style={[styles.badge, { backgroundColor: low ? colors.warningSoft : colors.successSoft }]}>
      <StockDot stock={stock} />
      <Text style={[styles.badgeText, { color: low ? colors.warning : colors.success }]}>
        {low ? 'Az stok' : 'Stokta'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { width: 7, height: 7, borderRadius: radius.pill },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  value: { ...typography.mono, fontSize: 12, lineHeight: 16, color: colors.textMuted },
  valueLow: { color: colors.warning },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  badgeText: { ...typography.caption, fontFamily: fonts.semibold },
});
