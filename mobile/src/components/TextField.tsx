import React from 'react';
import type { TextInputProps } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Input } from '../ui';

interface Props extends TextInputProps {
  label: string;
}

// Geriye dönük sarmalayıcı: içi ui/Input (etiket üstte, 48px alan, odak
// çerçevesi). Yeni kodda doğrudan `ui/Input` (unit / error / helper ile).
// Eski alanın altındaki boşluk (formlar buna güveniyor) korunuyor.
export function TextField({ label, style: _style, multiline, ...inputProps }: Props) {
  const t = useTheme();
  return (
    <Input
      label={label}
      multiline={multiline}
      numberOfLines={multiline ? 4 : undefined}
      textAlignVertical={multiline ? 'top' : undefined}
      containerStyle={{ marginBottom: t.space[4] }}
      {...inputProps}
    />
  );
}
