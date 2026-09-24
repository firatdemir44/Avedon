import React from 'react';
import { View, Text, type StyleProp, type ViewStyle } from 'react-native';
import { formatMeasure } from '../features/calculators/parse';
import { STOCK_UNIT_LABELS, type StockUnit } from '../features/products/catalog';
import { useTheme } from '../theme/ThemeContext';
import { Badge } from '../ui';
import { tr } from '../i18n';

// Bu miktarın altındaki stok "azalıyor" sayılır: uyarı rengi nokta ve yazı.
// Numune ve küçük sipariş için 100 m makul bir alt sınır; kilogramla satılan
// kumaşta (örme kumaşlar ~150-300 gr/m²'de metrenin kabaca üçte biri) 30 kg.
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
  const t = useTheme();
  return (
    <View
      style={{
        width: t.size.dot,
        height: t.size.dot,
        borderRadius: t.radius.full,
        backgroundColor: isLowStock(stock, unit) ? t.colors.warning : t.colors.success,
      }}
    />
  );
}

// Satır içi: "● 1.200 m" (mono-14). Az stokta yazı da uyarı rengine döner;
// erişilebilirlik etiketinde "azalıyor" sözle söylenir.
export function StockValue({ stock, unit = 'm', style }: StockProps & { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const low = isLowStock(stock, unit);
  return (
    <View
      style={[{ flexDirection: 'row', alignItems: 'center', gap: t.space[1] + t.space[1] / 2 }, style]}
      accessibilityLabel={`${tr('Stok')} ${formatMeasure(stock)} ${STOCK_UNIT_LABELS[unit]?.long ?? unit}${low ? `, ${tr('azalıyor')}` : ''}`}
    >
      <StockDot stock={stock} unit={unit} />
      <Text style={[t.type.mono14, { color: low ? t.colors.warning : t.colors.ink2 }]}>{formatStock(stock, unit)}</Text>
    </View>
  );
}

// Ürün sayfasının başındaki durum rozeti: STOKTA (info) / AZ STOK (pending).
export function StockBadge({ stock, unit }: StockProps) {
  const low = isLowStock(stock, unit);
  return low ? <Badge kind="pending" label={tr('Az stok')} /> : <Badge kind="info" label={tr('Stokta')} />;
}
