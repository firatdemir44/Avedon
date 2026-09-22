import React from 'react';
import { View, Text, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../ui';

// ESKİ liste satırı. Yeni ekranlar `ui/ListRow` kullanır; bu bileşen henüz
// taşınmamış ekranlar için duruyor ve yalnızca token'a bağlandı (ham hex/px yok,
// açık/koyu tema çalışır). Yeni kodda kullanılmaz.
export function ListRow({
  title,
  subtitle,
  onPress,
  left,
  right,
  chevron,
  divider = true,
  tone = 'default',
  minHeight,
  style,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  left?: React.ReactNode;
  // Oktan önce duran ek bilgi: sayı, rozet.
  right?: React.ReactNode;
  // Varsayılan: dokunulabiliyorsa ok var.
  chevron?: boolean;
  divider?: boolean;
  tone?: 'default' | 'danger';
  minHeight?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const showChevron = chevron ?? !!onPress;
  const danger = tone === 'danger';

  const content = (
    <>
      {left}
      <View style={{ flex: 1, minWidth: 0, gap: t.space[1] / 2 }}>
        <Text
          numberOfLines={2}
          style={[t.type.body16Strong, { color: danger ? t.colors.danger : t.colors.ink }]}
        >
          {title}
        </Text>
        {subtitle ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{subtitle}</Text> : null}
      </View>
      {right}
      {showChevron ? <Icon name="chevron" size={t.size.iconSm} color="ink3" /> : null}
    </>
  );

  const rowStyle: StyleProp<ViewStyle> = [
    {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space[3],
      paddingHorizontal: t.space[4],
      paddingVertical: t.space[2],
      minHeight: minHeight ?? t.size.touchMin + t.space[2],
      backgroundColor: t.colors.surface1,
    },
    divider ? { borderBottomWidth: 1, borderBottomColor: t.colors.line } : null,
    style,
  ];

  if (!onPress) {
    return <View style={rowStyle}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      android_ripple={{ color: t.colors.surface2 }}
      style={({ pressed }) => [rowStyle, pressed ? { backgroundColor: t.colors.surface2 } : null]}
    >
      {content}
    </Pressable>
  );
}
