// Sekme çubuğu (DESIGN.md §3): 64px, surface-1, üst kenarlık line.
// 5 öğe: 24px ikon + caption-12 etiket her zaman birlikte. Aktif brand, pasif ink-3.
// 8px accent bildirim noktası. react-navigation ile: `tabBar={TabBarFromNavigation}`.
import React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '../theme/ThemeContext';
import { Icon, type AnyIconName } from './Icon';

export interface TabItem {
  key: string;
  label: string;
  icon: AnyIconName;
  /** Bildirim noktası. */
  dot?: boolean;
}

export interface TabBarProps {
  items: TabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  style?: StyleProp<ViewStyle>;
}

export function TabBar({ items, activeKey, onSelect, style }: TabBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        {
          flexDirection: 'row',
          backgroundColor: t.colors.surface1,
          borderTopWidth: 1,
          borderTopColor: t.colors.line,
          paddingBottom: insets.bottom,
        },
        style,
      ]}
    >
      {items.map((item) => {
        const on = item.key === activeKey;
        const color = on ? t.colors.brand : t.colors.ink3;
        return (
          <Pressable
            key={item.key}
            onPress={() => onSelect(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={item.label}
            // Seçili sekme: brandSoft zemin + kalın çizgi + brand renk (Fırat: hangi sekmede
            // olduğum belli olsun, 2026-09-22).
            style={({ pressed }) => ({
              flex: 1,
              minHeight: t.size.tabbar,
              alignItems: 'center',
              justifyContent: 'center',
              gap: t.space[1] / 2,
              backgroundColor: on ? t.colors.brandSoft : pressed ? t.colors.surface2 : 'transparent',
              borderTopWidth: 2,
              borderTopColor: on ? t.colors.brand : 'transparent',
            })}
          >
            <View>
              <Icon name={item.icon} colorValue={color} />
              {item.dot ? (
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: -t.space[1] / 2,
                    width: t.size.dot,
                    height: t.size.dot,
                    borderRadius: t.radius.full,
                    backgroundColor: t.colors.accent,
                  }}
                />
              ) : null}
            </View>
            <Text numberOfLines={1} style={[t.type.caption12, { color }]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Bilinen sekme rotalarının ikonları (DESIGN.md §2'deki 5 sekme). */
export const routeIcons: Record<string, AnyIconName> = {
  Feed: 'home',
  ProductList: 'catalog',
  AssistantTab: 'message',
  Conversations: 'messages',
  Calculators: 'calculator',
  QuoteRequests: 'requests',
};

export interface TabBarFromNavigationProps extends BottomTabBarProps {
  /** Rota adı → ikon eşlemesini genişletir. */
  icons?: Record<string, AnyIconName>;
  /**
   * Çubukta GÖSTERİLMEYECEK rota adları. Navigatörde kayıtlı kalırlar —
   * `navigation.navigate('AssistantTab')` gibi çağrılar bozulmaz — yalnızca
   * sekme çubuğunda çizilmezler (DESIGN.md §2: çubukta tam 5 sekme).
   */
  hiddenRoutes?: string[];
}

/** react-navigation bottom-tabs `tabBar` prop'u için sarmalayıcı. */
export function TabBarFromNavigation({
  state,
  descriptors,
  navigation,
  icons,
  hiddenRoutes,
}: TabBarFromNavigationProps) {
  const map = { ...routeIcons, ...(icons ?? {}) };
  const hidden = new Set(hiddenRoutes ?? []);
  const items: TabItem[] = state.routes
    .filter((route) => !hidden.has(route.name))
    .map((route) => {
      const { options } = descriptors[route.key];
      const label =
        typeof options.tabBarLabel === 'string'
          ? options.tabBarLabel
          : (options.title ?? route.name);
      return {
        key: route.key,
        label,
        icon: map[route.name] ?? 'info',
        dot: options.tabBarBadge != null,
      };
    });

  const activeKey = state.routes[state.index]?.key ?? '';

  return (
    <TabBar
      items={items}
      activeKey={activeKey}
      onSelect={(key) => {
        const route = state.routes.find((r) => r.key === key);
        if (!route) return;
        const focused = key === activeKey;
        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
      }}
    />
  );
}
