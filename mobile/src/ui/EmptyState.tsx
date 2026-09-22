// Boş durum (DESIGN.md §3): 48px kontur ikon ink-3, title-18 başlık (yapılacak
// işi söyler), body-14 ink-2 tek cümle (max 280), altında kenarlıklı düğme.
import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Icon, type AnyIconName } from './Icon';
import { Button } from './Button';

export interface EmptyStateProps {
  icon: AnyIconName;
  title: string;
  description?: string;
  /** Kenarlıklı (secondary) düğme. */
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ icon, title, description, actionLabel, onAction, style }: EmptyStateProps) {
  const t = useTheme();
  return (
    <View
      style={[
        { alignItems: 'center', justifyContent: 'center', gap: t.space[3], paddingVertical: t.space[8] },
        style,
      ]}
    >
      <Icon name={icon} size={t.size.emptyIcon} color="ink3" />
      <Text style={[t.type.title18, { color: t.colors.ink, textAlign: 'center' }]}>{title}</Text>
      {description ? (
        <Text style={[t.type.body14, { color: t.colors.ink2, textAlign: 'center', maxWidth: t.size.emptyTextWidth }]}>
          {description}
        </Text>
      ) : null}
      {/* Button'un kendi `alignSelf: flex-start`i kapsayıcının ortalamasını
          eziyordu; boş durumda düğme ortada olmalı (DESIGN.md §3). */}
      {actionLabel && onAction ? (
        <Button kind="secondary" label={actionLabel} onPress={onAction} style={{ alignSelf: 'center' }} />
      ) : null}
    </View>
  );
}
