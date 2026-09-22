// Bölüm başlığı (DESIGN.md §5): title-18, sağda isteğe bağlı bağlantı label-14 brand.
import React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export interface SectionTitleProps {
  title: string;
  /** Sağdaki bağlantının metni (örn. "Tümünü gör"). */
  linkLabel?: string;
  onLinkPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function SectionTitle({ title, linkLabel, onLinkPress, style }: SectionTitleProps) {
  const t = useTheme();
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space[3], minWidth: 0 },
        style,
      ]}
    >
      <Text accessibilityRole="header" numberOfLines={1} style={[t.type.title18, { color: t.colors.ink, flexShrink: 1 }]}>
        {title}
      </Text>
      {linkLabel && onLinkPress ? (
        <Pressable
          onPress={onLinkPress}
          accessibilityRole="link"
          accessibilityLabel={linkLabel}
          style={{ minHeight: t.size.touchMin, justifyContent: 'center', paddingLeft: t.space[2] }}
        >
          <Text style={[t.type.label14, { color: t.colors.brand }]}>{linkLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
