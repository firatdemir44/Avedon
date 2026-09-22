// Liste satırı (DESIGN.md §3): min 64px, sol 40px avatar (kişi yuvarlak /
// firma radius-sm), başlık + alt metin, sağda özel node / zaman / chevron.
// Okunmamış: alt metin `ink` + `accent` sayaç. Satırlar tam genişlik 1px `line`.
import React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from './Icon';

export type AvatarKind = 'person' | 'company';

export interface AvatarProps {
  /** Baş harfleri buradan üretilir. */
  name: string;
  kind?: AvatarKind;
  size?: number;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map((p) => p.charAt(0).toLocaleUpperCase('tr-TR')).join('');
}

export function Avatar({ name, kind = 'person', size }: AvatarProps) {
  const t = useTheme();
  const d = size ?? t.size.avatar;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: d,
        height: d,
        borderRadius: kind === 'person' ? t.radius.full : t.radius.sm,
        backgroundColor: t.colors.brandSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={[t.type.label14, { color: t.colors.brand }]}>{initialsOf(name)}</Text>
    </View>
  );
}

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Avatar yerine özel bir sol node (ikon karesi, görsel …). */
  left?: React.ReactNode;
  /** `left` verilmediyse avatarın adı ve türü. */
  avatarName?: string;
  avatarKind?: AvatarKind;
  /** Sağda özel node (rozet, düğme değil — iç içe düğme olmaz). */
  right?: React.ReactNode;
  /** Sağda zaman damgası (right verilmediyse). */
  time?: string;
  /** Okunmamış: alt metin koyulaşır, sayaç pill'i çıkar. */
  unread?: boolean;
  unreadCount?: number;
  onPress?: () => void;
  /** Satırın altındaki tam genişlik ayırıcı (son satırda kapatın). */
  divider?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ListRow({
  title,
  subtitle,
  left,
  avatarName,
  avatarKind = 'person',
  right,
  time,
  unread = false,
  unreadCount,
  onPress,
  divider = true,
  style,
  testID,
}: ListRowProps) {
  const t = useTheme();

  const body = (
    <>
      {left ?? (avatarName ? <Avatar name={avatarName} kind={avatarKind} /> : null)}
      <View style={{ flex: 1, minWidth: 0, gap: t.space[1] / 2 }}>
        <Text numberOfLines={1} style={[t.type.body16Strong, { color: t.colors.ink }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={[
              unread ? t.type.label14 : t.type.body14,
              { color: unread ? t.colors.ink : t.colors.ink2 },
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
        {right ??
          (time ? (
            <Text style={[t.type.caption12, { color: t.colors.ink3 }]}>{time}</Text>
          ) : onPress ? (
            <Icon name="chevron" color="ink3" />
          ) : null)}
        {unread && unreadCount ? (
          <View
            style={{
              minWidth: t.size.counter,
              height: t.size.counter,
              paddingHorizontal: t.space[1],
              borderRadius: t.radius.full,
              backgroundColor: t.colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={[t.type.caption12, { color: t.colors.onBrand }]}>{unreadCount}</Text>
          </View>
        ) : null}
      </View>
    </>
  );

  const rowStyle: ViewStyle = {
    minHeight: t.size.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space[3],
    paddingVertical: t.space[2],
    borderBottomWidth: divider ? 1 : 0,
    borderBottomColor: t.colors.line,
    minWidth: 0,
  };

  if (!onPress) {
    return (
      <View style={[rowStyle, style]} testID={testID}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      testID={testID}
      style={({ pressed }) => [rowStyle, { backgroundColor: pressed ? t.colors.surface2 : 'transparent' }, style]}
    >
      {body}
    </Pressable>
  );
}
