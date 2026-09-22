// Rozet (DESIGN.md §3): 22px, BÜYÜK HARF caption-12, her zaman ikon + metin
// (durum yalnız renkle verilmez, §6).
import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Icon, type AnyIconName } from './Icon';
import type { ColorTokens } from '../theme/tokens';

export type BadgeKind =
  | 'verified'
  | 'pending'
  | 'delivered'
  | 'cancelled'
  | 'new'
  | 'info';

const KINDS: Record<BadgeKind, { bg: keyof ColorTokens; fg: keyof ColorTokens; icon: AnyIconName; label: string }> = {
  verified: { bg: 'successSoft', fg: 'success', icon: 'shield-checkmark-outline', label: 'DOĞRULANMIŞ' },
  pending: { bg: 'warningSoft', fg: 'warning', icon: 'clock', label: 'BEKLİYOR' },
  delivered: { bg: 'successSoft', fg: 'success', icon: 'checkmark-circle-outline', label: 'TESLİM EDİLDİ' },
  cancelled: { bg: 'dangerSoft', fg: 'danger', icon: 'close-circle-outline', label: 'İPTAL' },
  new: { bg: 'accentSoft', fg: 'accent', icon: 'sparkles-outline', label: 'YENİ' },
  info: { bg: 'brandSoft', fg: 'brand', icon: 'info', label: 'STOKTA' },
};

export interface BadgeProps {
  kind: BadgeKind;
  /** Türün varsayılan metnini değiştirir (yine BÜYÜK HARF yazılır). */
  label?: string;
  style?: StyleProp<ViewStyle>;
}

export function Badge({ kind, label, style }: BadgeProps) {
  const t = useTheme();
  const k = KINDS[kind];
  const text = (label ?? k.label).toLocaleUpperCase('tr-TR');
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={text}
      style={[
        {
          minHeight: t.size.badge,
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: t.space[1],
          paddingHorizontal: t.space[2],
          borderRadius: t.radius.sm,
          backgroundColor: t.colors[k.bg],
          maxWidth: '100%',
        },
        style,
      ]}
    >
      <Icon name={k.icon} size={t.size.iconXs} color={k.fg} />
      <Text numberOfLines={1} style={[t.type.caption12, { color: t.colors[k.fg], flexShrink: 1 }]}>
        {text}
      </Text>
    </View>
  );
}
