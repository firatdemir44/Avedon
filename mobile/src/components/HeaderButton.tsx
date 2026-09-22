import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Icon, type AnyIconName } from '../ui';

// Lacivert üst bantta eylem düğmesi (DESIGN.md §2: bantta en fazla 2 ikon
// düğmesi, her biri 44px). Taslaklarda başlık eylemleri ikon ya da ikon + kısa
// etiket; düz metin yok. Etiket gizliyse ekran okuyucu için `label` okunur.
//
// Yeni tasarım (4. adım): renk/ölçü token'lardan; sayaç `accent` (DESIGN.md §3
// okunmamış sayacı), rozetin içi `onBrand`.
export function HeaderButton({
  icon,
  label,
  showLabel = false,
  badge,
  onPress,
}: {
  icon: AnyIconName;
  label: string;
  showLabel?: boolean;
  // Okunmamış sayısı. 0/undefined ise rozet çizilmez; 99'dan fazlası "99+" olur.
  badge?: number;
  onPress: () => void;
}) {
  const t = useTheme();
  const count = badge && badge > 0 ? badge : 0;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `${label}, ${count} okunmamış` : label}
      style={({ pressed }) => ({
        minWidth: t.size.touchMin,
        height: t.size.touchMin,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: t.space[1],
        paddingHorizontal: showLabel ? t.space[2] : 0,
        borderRadius: t.radius.md,
        backgroundColor: pressed ? t.colors.brandStrong : 'transparent',
      })}
    >
      <Icon name={icon} size={showLabel ? t.size.iconSm : t.size.icon} colorValue={t.colors.onBrand} />
      {showLabel ? <Text style={[t.type.label14, { color: t.colors.onBrand }]}>{label}</Text> : null}
      {count > 0 ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: t.space[1],
            right: 0,
            minWidth: t.size.dot * 2,
            height: t.size.dot * 2,
            paddingHorizontal: t.space[1],
            borderRadius: t.radius.full,
            backgroundColor: t.colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={[t.type.caption12, { color: t.colors.onBrand }]}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
