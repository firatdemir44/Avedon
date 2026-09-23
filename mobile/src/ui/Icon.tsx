// İkon (DESIGN.md §4): kontur ikonlar, 24px, rengi her zaman bir metin token'ı.
// Lucide kurulu değil; Ionicons'un OUTLINE varyantları kullanılıyor. Sık geçen
// isimler burada eşlenir ki ekranlarda Ionicons adı yazılmasın.
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import type { ColorTokens } from '../theme/tokens';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export const iconMap = {
  home: 'home-outline',
  catalog: 'grid-outline',
  requests: 'document-text-outline',
  messages: 'chatbubble-ellipses-outline',
  calculator: 'calculator-outline',
  bell: 'notifications-outline',
  user: 'person-outline',
  search: 'search-outline',
  back: 'arrow-back-outline',
  up: 'arrow-up-outline',
  chevron: 'chevron-forward-outline',
  filter: 'funnel-outline',
  camera: 'camera-outline',
  share: 'share-social-outline',
  heart: 'heart-outline',
  plus: 'add-outline',
  check: 'checkmark-outline',
  x: 'close-outline',
  sample: 'cube-outline',
  quote: 'document-text-outline',
  message: 'chatbubble-outline',
  whatsapp: 'logo-whatsapp',
  fabric: 'layers-outline',
  yarn: 'git-network-outline',
  scale: 'scale-outline',
  machine: 'cog-outline',
  info: 'information-circle-outline',
  warning: 'warning-outline',
  clock: 'time-outline',
} as const satisfies Record<string, IoniconName>;

export type IconName = keyof typeof iconMap;
/** Eşlenmiş kısa ad ya da doğrudan bir Ionicons adı. */
export type AnyIconName = IconName | IoniconName;

export interface IconProps {
  name: AnyIconName;
  /** Varsayılan `size.icon` (24). Küçük ikon için `size.iconSm` (20) verin. */
  size?: number;
  /** Metin rengi token'ı; varsayılan `ink`. */
  color?: keyof ColorTokens;
  /** Token dışı bir renk gerekiyorsa (örn. ters zemin) doğrudan değer. */
  colorValue?: string;
}

export function resolveIconName(name: AnyIconName): IoniconName {
  return (iconMap as Record<string, IoniconName>)[name as string] ?? (name as IoniconName);
}

export function Icon({ name, size, color = 'ink', colorValue }: IconProps) {
  const t = useTheme();
  return (
    <Ionicons
      name={resolveIconName(name)}
      size={size ?? t.size.icon}
      color={colorValue ?? t.colors[color]}
    />
  );
}
