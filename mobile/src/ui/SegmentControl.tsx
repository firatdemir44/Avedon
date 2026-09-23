// Segment kontrol (DESIGN.md §3): surface-2 zemin, 4px iç boşluk, radius-md;
// öğe 36px; seçili surface-1 + 1px line.
import React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Seçilemez (soluk gösterilir, dokunulunca bir şey olmaz). */
  disabled?: boolean;
}

export interface SegmentControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Erişilebilirlik için grubun adı (örn. "Görünüm"). */
  accessibilityLabel?: string;
  /** Öğeleri eşit genişlikte gerer. */
  stretch?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SegmentControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  stretch,
  style,
}: SegmentControlProps<T>) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          flexDirection: 'row',
          backgroundColor: t.colors.surface2,
          borderRadius: t.radius.md,
          padding: t.space[1],
          alignSelf: stretch ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            hitSlop={{ top: (t.size.touchMin - t.size.chip) / 2, bottom: (t.size.touchMin - t.size.chip) / 2 }}
            onPress={() => {
              if (!o.disabled) onChange(o.value);
            }}
            disabled={o.disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: !!o.disabled }}
            accessibilityLabel={accessibilityLabel ? `${accessibilityLabel}: ${o.label}` : o.label}
            style={{
              flex: stretch ? 1 : undefined,
              minHeight: t.size.chip,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: t.space[3],
              borderRadius: t.radius.sm,
              borderWidth: 1,
              borderColor: on ? t.colors.line : 'transparent',
              backgroundColor: on ? t.colors.surface1 : 'transparent',
            }}
          >
            <Text numberOfLines={1} style={[t.type.label14, { color: on ? t.colors.ink : o.disabled ? t.colors.ink3 : t.colors.ink2 }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
