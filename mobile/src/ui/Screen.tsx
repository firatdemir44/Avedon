// Ekran iskeleti (DESIGN.md §1–2): surface-0 zemin, içerik maxWidth 480
// ortalanmış, yatay boşluk space-4, son elemanın altında space-10.
// `sticky` verilirse altta yapışkan eylem çubuğu (surface-1, üst line, shadow-raised).
import React from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';

export interface ScreenProps {
  children: React.ReactNode;
  /** Yapışkan alt eylem çubuğunun içeriği (genelde <Button size="lg" />). */
  sticky?: React.ReactNode;
  /** Kaydırma kapatılır (kendi FlatList'ini kuran ekranlar için). */
  scroll?: boolean;
  /** Yatay boşluğu kaldırır (tam genişlik listeler). */
  noPadding?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Screen({
  children,
  sticky,
  scroll = true,
  noPadding = false,
  contentStyle,
  style,
  testID,
}: ScreenProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  const inner: StyleProp<ViewStyle> = [
    {
      width: '100%',
      maxWidth: t.size.maxContentWidth,
      alignSelf: 'center',
      paddingHorizontal: noPadding ? 0 : t.space[4],
      gap: t.space[6],
      minWidth: 0,
    },
    contentStyle,
  ];

  return (
    <View style={[{ flex: 1, backgroundColor: t.colors.surface0 }, style]} testID={testID}>
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: t.space[4], paddingBottom: t.space[10], alignItems: 'center' }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={inner}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[{ flex: 1, paddingTop: t.space[4] }, inner]}>{children}</View>
      )}

      {sticky ? (
        <View
          style={[
            {
              backgroundColor: t.colors.surface1,
              borderTopWidth: 1,
              borderTopColor: t.colors.line,
              paddingHorizontal: t.space[4],
              paddingTop: t.space[3],
              paddingBottom: t.space[3] + insets.bottom,
            },
            t.shadowRaised,
          ]}
        >
          <View style={{ width: '100%', maxWidth: t.size.maxContentWidth, alignSelf: 'center' }}>{sticky}</View>
        </View>
      ) : null}
    </View>
  );
}
