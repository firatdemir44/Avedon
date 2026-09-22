// Düğme (DESIGN.md §3). Türler: primary (dolu) · secondary (kenarlıklı) ·
// quiet (zeminsiz) · danger (kenarlıklı, tehlike rengi). Ekranda en fazla 1 primary.
import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Icon, type AnyIconName } from './Icon';
import type { ColorTokens } from '../theme/tokens';

export type ButtonKind = 'primary' | 'secondary' | 'quiet' | 'danger';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  kind?: ButtonKind;
  /** md = `control` (48), lg = `controlLg` (52) ve tam genişlik. */
  size?: ButtonSize;
  /** Metnin solunda 20px ikon. */
  icon?: AnyIconName;
  disabled?: boolean;
  /** İçinde dönen simge; düğme basılamaz olur. */
  loading?: boolean;
  /** lg zaten tam genişlik; md'yi de germek için. */
  fullWidth?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  size = 'md',
  icon,
  disabled = false,
  loading = false,
  fullWidth,
  accessibilityLabel,
  style,
  testID,
}: ButtonProps) {
  const t = useTheme();
  const off = disabled || loading;

  const look = useMemo(() => {
    const c = t.colors;
    const map: Record<ButtonKind, { bg: string; bgPressed: string; border?: string; fg: keyof ColorTokens }> = {
      primary: { bg: c.brand, bgPressed: c.brandStrong, fg: 'onBrand' },
      secondary: { bg: c.surface1, bgPressed: c.surface2, border: c.lineStrong, fg: 'ink' },
      quiet: { bg: 'transparent', bgPressed: c.surface2, fg: 'brand' },
      danger: { bg: c.surface1, bgPressed: c.dangerSoft, border: c.danger, fg: 'danger' },
    };
    return map[kind];
  }, [kind, t]);

  const height = size === 'lg' ? t.size.controlLg : t.size.control;
  const stretch = size === 'lg' || fullWidth;

  return (
    <Pressable
      onPress={off ? undefined : onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: off, busy: loading }}
      testID={testID}
      style={({ pressed }) => [
        {
          minHeight: height,
          borderRadius: t.radius.md,
          paddingHorizontal: t.space[4],
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: t.space[2],
          backgroundColor: pressed && !off ? look.bgPressed : look.bg,
          borderWidth: look.border ? 1 : 0,
          borderColor: look.border,
          opacity: off ? 0.4 : 1,
          alignSelf: stretch ? 'stretch' : 'flex-start',
          width: stretch ? '100%' : undefined,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={t.colors[look.fg]} />
      ) : icon ? (
        <Icon name={icon} size={t.size.iconSm} color={look.fg} />
      ) : null}
      <View style={{ minWidth: 0, flexShrink: 1 }}>
        <Text numberOfLines={1} style={[t.type.button16, { color: t.colors[look.fg] }]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
