// Üst bant (DESIGN.md §2): 56px, surface-brand zemin, on-brand metin.
// Sol: geri oku (44px) | logo | özel node. Başlık title-18, tek satır kısaltılır.
// Sağda en fazla 2 ikon düğmesi (44px). Üstte güvenli alan boşluğu.
import React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Icon, type AnyIconName } from './Icon';
import { Logo } from './Logo';

export interface AppBarAction {
  icon: AnyIconName;
  /** İkon-yalnız düğme: erişilebilirlik adı zorunlu (DESIGN.md §6). */
  label: string;
  onPress: () => void;
  /** Sağ üstte accent bildirim noktası. */
  dot?: boolean;
}

export interface AppBarProps {
  title: string;
  /** 'back' geri oku · 'logo' simge · 'none' boşluk. */
  leading?: 'back' | 'logo' | 'none';
  onBack?: () => void;
  /** leading yerine tamamen özel bir sol node. */
  left?: React.ReactNode;
  /** En fazla 2 tanesi çizilir. */
  actions?: AppBarAction[];
  style?: StyleProp<ViewStyle>;
}

function BarButton({ action }: { action: AppBarAction }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={action.onPress}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      style={({ pressed }) => ({
        width: t.size.touchMin,
        height: t.size.touchMin,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: t.radius.md,
        backgroundColor: pressed ? t.colors.brandStrong : 'transparent',
      })}
    >
      <Icon name={action.icon} colorValue={t.colors.onBrand} />
      {action.dot ? (
        <View
          style={{
            position: 'absolute',
            top: t.space[2],
            right: t.space[2],
            width: t.size.dot,
            height: t.size.dot,
            borderRadius: t.radius.full,
            backgroundColor: t.colors.accent,
          }}
        />
      ) : null}
    </Pressable>
  );
}

export function AppBar({ title, leading = 'none', onBack, left, actions = [], style }: AppBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const shown = actions.slice(0, 2);

  return (
    <View
      style={[
        {
          paddingTop: insets.top,
          backgroundColor: t.colors.surfaceBrand,
        },
        style,
      ]}
    >
      <View
        style={{
          minHeight: t.size.appbar,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: t.space[2],
          gap: t.space[2],
          minWidth: 0,
        }}
      >
        {left ??
          (leading === 'back' ? (
            <BarButton action={{ icon: 'back', label: 'Geri', onPress: onBack ?? (() => undefined) }} />
          ) : leading === 'logo' ? (
            <View
              style={{
                width: t.size.touchMin,
                height: t.size.touchMin,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Logo />
            </View>
          ) : null)}
        <View style={{ flex: 1, minWidth: 0, paddingHorizontal: leading === 'none' && !left ? t.space[2] : 0 }}>
          <Text
            numberOfLines={1}
            accessibilityRole="header"
            style={[t.type.title18, { color: t.colors.onBrand }]}
          >
            {title}
          </Text>
        </View>
        {shown.map((a) => (
          <BarButton key={a.label} action={a} />
        ))}
      </View>
    </View>
  );
}
