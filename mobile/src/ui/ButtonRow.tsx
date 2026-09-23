// Yan yana düğmeler (tasarım incelemesi 2026-09-23): düğme metni asla
// kısaltılmaz. Düğmeler kendi içerik genişlikleriyle yan yana dizilir ve
// kalan yeri paylaşır; sığmıyorlarsa alt alta iner (her biri tam genişlik).
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export interface ButtonRowProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ButtonRow({ children, style }: ButtonRowProps) {
  const t = useTheme();
  const items = React.Children.toArray(children).filter(React.isValidElement) as React.ReactElement<{
    style?: StyleProp<ViewStyle>;
  }>[];
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }, style]}>
      {items.map((child) =>
        React.cloneElement(child, {
          style: [child.props.style, { flexGrow: 1, flexShrink: 0, flexBasis: 'auto' }],
        }),
      )}
    </View>
  );
}
