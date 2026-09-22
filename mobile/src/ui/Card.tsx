// Kart (DESIGN.md §3): surface-1, 1px line, radius-lg, iç boşluk space-4, gölge yok.
// onPress verilirse tamamı tıklanabilir olur ve sağda chevron çıkar.
import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from './Icon';

export interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** İç boşluğu kaldırır (paylaşım kartı gibi bölümleri kendi boşluğunu taşıyan kartlar). */
  noPadding?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Card({ children, onPress, accessibilityLabel, noPadding, style, testID }: CardProps) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: t.colors.surface1,
    borderWidth: 1,
    borderColor: t.colors.line,
    borderRadius: t.radius.lg,
    padding: noPadding ? 0 : t.space[4],
    minWidth: 0,
  };

  if (!onPress) {
    return (
      <View style={[base, style]} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={({ pressed }) => [
        base,
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[3],
          backgroundColor: pressed ? t.colors.surface2 : t.colors.surface1,
        },
        style,
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      <Icon name="chevron" color="ink3" />
    </Pressable>
  );
}
