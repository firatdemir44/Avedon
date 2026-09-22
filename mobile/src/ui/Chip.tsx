// Çip / filtre (DESIGN.md §3): 36px pill, 1px line-strong, label-14.
// Seçili: brand zemin + on-brand metin. ChipRow satır kırmaz, yatay kaydırılır.
import React from 'react';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Icon, type AnyIconName } from './Icon';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: AnyIconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Chip({ label, selected = false, onPress, icon, disabled, style }: ChipProps) {
  const t = useTheme();
  const fg = selected ? t.colors.onBrand : t.colors.ink;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          minHeight: t.size.chip,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[1],
          paddingHorizontal: t.space[3],
          borderRadius: t.radius.full,
          borderWidth: 1,
          borderColor: selected ? t.colors.brand : t.colors.lineStrong,
          backgroundColor: selected
            ? pressed
              ? t.colors.brandStrong
              : t.colors.brand
            : pressed
              ? t.colors.surface2
              : t.colors.surface1,
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={t.size.iconSm} colorValue={fg} /> : null}
      <Text numberOfLines={1} style={[t.type.label14, { color: fg }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export interface ChipRowProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Yatay kaydırılan çip satırı; satır kırmaz. */
export function ChipRow({ children, style }: ChipRowProps) {
  const t = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={{ flexDirection: 'row', gap: t.space[2], paddingVertical: t.space[1] }}
    >
      <View style={{ flexDirection: 'row', gap: t.space[2] }}>{children}</View>
    </ScrollView>
  );
}
