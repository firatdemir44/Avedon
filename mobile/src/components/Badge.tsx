import React from 'react';
import type { ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Badge as UiBadge } from '../ui';

interface Props {
  label: string;
  // Eski tonlar korunuyor (geriye dönük). Yeni tasarımda hepsi ui/Badge'in
  // `info` türü (brand-soft / brand); `outline` yalnızca zemin yerine 1px
  // çerçeve alır. Yeni kodda doğrudan `ui/Badge kind=…` kullanılır.
  tone?: 'solid' | 'soft' | 'outline';
  style?: ViewStyle;
}

// Genel amaçlı bilgi rozeti; eski sekiz ayrı kopyanın yerine tek yer.
export function Badge({ label, tone = 'soft', style }: Props) {
  const t = useTheme();
  const outline: ViewStyle | undefined =
    tone === 'outline'
      ? { backgroundColor: t.colors.surface1, borderWidth: 1, borderColor: t.colors.line }
      : undefined;
  return <UiBadge kind="info" label={label} style={[outline, style]} />;
}
