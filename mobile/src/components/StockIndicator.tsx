import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { formatMeasure } from '../features/calculators/parse';
import { STOCK_UNIT_LABELS, type StockUnit } from '../features/products/catalog';
import { colors, fonts, radius, spacing, typography } from '../theme';

// Bu miktarın altındaki stok "azalıyor" sayılır: turuncu nokta ve yazı.
// Taslakta 60 m turuncu, 540 m ve üstü yeşil gösteriliyordu; numune ve küçük
// sipariş için 100 m makul bir alt sınır. Kilogramla satılan kumaşta (örme
// kumaşlar ~150-300 gr/m²'de metrenin kabaca üçte biri) 30 kg.
export const LOW_STOCK: Record<StockUnit, number> = { m: 100, kg: 30 };

export function isLowStock(stock: number, unit: StockUnit = 'm') {
  return stock < (LOW_STOCK[unit] ?? LOW_STOCK.m);
}

// "1.200 m" / "450 kg"
export function formatStock(stock: number, unit: StockUnit = 'm') {
  return `${formatMeasure(stock)} ${STOCK_UNIT_LABELS[unit]?.short ?? unit}`;
}

interface StockProps {
  stock: number;
  unit?: StockUnit;
}

export function StockDot({ stock, unit }: StockProps) {
  return <View style={[styles.dot, { backgroundColor: isLowStock(stock, unit) ? colors.warningDot : colors.success }]} />;
}

// Satır içi: "● 1.200 m" (eşit aralıklı yazı).
export function StockValue({ stock, unit = 'm', style }: StockProps & { style?: StyleProp<ViewStyle> }) {
  const low = isLowStock(stock, unit);
  return (
    <View
      style={[styles.inline, style]}
      accessibilityLabel={`Stok ${formatMeasure(stock)} ${STOCK_UNIT_LABELS[unit]?.long ?? unit}${low ? ', azalıyor' : ''}`}
    >
      <StockDot stock={stock} unit={unit} />
      <Text style={[styles.value, low && styles.valueLow]}>{formatStock(stock, unit)}</Text>
    </View>
  );
}

// Ürün sayfasının başındaki durum rozeti: "● Stokta" / "● Az stok".
export function StockBadge({ stock, unit }: StockProps) {
  const low = isLowStock(stock, unit);
  return (
    <View style={[styles.badge, { backgroundColor: low ? colors.warningSoft : colors.successSoft }]}>
      <StockDot stock={stock} unit={unit} />
      <Text style={[styles.badgeText, { color: low ? colors.warning : colors.success }]}>
        {low ? 'Az stok' : 'Stokta'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { width: 7, height: 7, borderRadius: radius.pill },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  value: { ...typography.mono, fontSize: 14, lineHeight: 19, color: colors.textMuted },
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
