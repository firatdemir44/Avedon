// İstatistik kutusu (DESIGN.md §3): sayı display-28 (vurguluysa accent),
// etiket body-14 ink-2. Genelde 3 sütun.
import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export interface StatBoxProps {
  value: string | number;
  label: string;
  /** Sayıyı accent renginde yazar. */
  accent?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function StatBox({ value, label, accent = false, style }: StatBoxProps) {
  const t = useTheme();
  return (
    <View
      accessibilityLabel={`${value} ${label}`}
      style={[{ flex: 1, minWidth: 0, gap: t.space[1] }, style]}
    >
      <Text numberOfLines={1} style={[t.type.display28, { color: accent ? t.colors.accent : t.colors.ink }]}>
        {value}
      </Text>
      <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{label}</Text>
    </View>
  );
}
