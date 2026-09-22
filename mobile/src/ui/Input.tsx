// Giriş alanı (DESIGN.md §3): etiket üstte, 48px alan, odakta 2px `focus`
// çerçeve, hata durumunda `danger` kenarlık + ikonlu hata metni, sağda birim eki.
import React, { forwardRef, useState } from 'react';
import {
  TextInput,
  Text,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from './Icon';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  /** Alanın üstündeki etiket. Verilmezse `accessibilityLabel` kullanılır. */
  label?: string;
  /** Hata metni; verilince kenarlık `danger` olur. */
  error?: string | null;
  /** Alanın altındaki açıklama (hata varsa gösterilmez). */
  helper?: string;
  /** Sağdaki birim eki: gr/m², cm, ₺/kg … */
  unit?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, helper, unit, containerStyle, onFocus, onBlur, ...rest },
  ref
) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const hasError = !!error;
  const borderColor = hasError ? t.colors.danger : focused ? t.colors.focus : t.colors.lineStrong;

  return (
    <View style={[{ gap: t.space[1], minWidth: 0 }, containerStyle]}>
      {label ? <Text style={[t.type.label14, { color: t.colors.ink2 }]}>{label}</Text> : null}
      {/* Odak çerçevesi dışarıda (outline-offset: 2px karşılığı): alanın kendi
          kenarlığı 1px kalır, odakta düzen kaymaz. */}
      <View
        style={{
          borderWidth: 2,
          borderColor: focused ? t.colors.focus : 'transparent',
          borderRadius: t.radius.md + t.space[1],
          padding: t.space[1] / 2,
          minWidth: 0,
        }}
      >
      <View
        style={{
          minHeight: t.size.control,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[2],
          paddingHorizontal: t.space[3],
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor,
          backgroundColor: t.colors.surface1,
          minWidth: 0,
        }}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          placeholderTextColor={t.colors.ink3}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            t.type.body16,
            {
              flex: 1,
              minWidth: 0,
              color: t.colors.ink,
              paddingVertical: t.space[2],
              // Web'de tarayıcının kendi odak halkası çıkmasın; çerçeveyi biz çiziyoruz.
              outlineStyle: 'none',
            } as never,
          ]}
          {...rest}
        />
        {unit ? (
          <Text style={[t.type.mono14, { color: t.colors.ink3 }]} numberOfLines={1}>
            {unit}
          </Text>
        ) : null}
      </View>
      </View>
      {hasError ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[1], minWidth: 0 }}>
          <Icon name="alert-circle-outline" size={t.size.iconSm} color="danger" />
          <Text style={[t.type.body14, { color: t.colors.danger, flexShrink: 1 }]}>{error}</Text>
        </View>
      ) : helper ? (
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{helper}</Text>
      ) : null}
    </View>
  );
});
