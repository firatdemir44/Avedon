// Kısayol kutusu (DESIGN.md §3, Ana sayfa): 80px kart, sol 40px ikon karesi
// brand-soft / brand, radius-md; metin 16px 600, iki satıra kırılabilir.
import React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Icon, type AnyIconName } from './Icon';

export interface QuickActionProps {
  label: string;
  icon: AnyIconName;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function QuickAction({ label, icon, onPress, style, testID }: QuickActionProps) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [
        {
          minHeight: t.size.quickAction,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[3],
          padding: t.space[3],
          borderRadius: t.radius.lg,
          borderWidth: 1,
          borderColor: t.colors.line,
          backgroundColor: pressed ? t.colors.surface2 : t.colors.surface1,
          minWidth: 0,
        },
        style,
      ]}
    >
      <View
        style={{
          width: t.size.avatar,
          height: t.size.avatar,
          borderRadius: t.radius.md,
          backgroundColor: t.colors.brandSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} color="brand" />
      </View>
      <Text numberOfLines={2} style={[t.type.body16Strong, { color: t.colors.ink, flex: 1, minWidth: 0 }]}>
        {label}
      </Text>
    </Pressable>
  );
}
