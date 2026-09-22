import React from 'react';
import type { ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { Button } from '../ui';

type IconName = keyof typeof Ionicons.glyphMap;

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  // primary → ui/Button `primary` (dolu; ekranda en fazla 1)
  // secondary / outline → ui/Button `secondary` (kenarlıklı)
  variant?: 'primary' | 'secondary' | 'outline';
  // Yükseklik DESIGN.md §3'e göre hep `control` (48). `lg` eskiden de 48 idi;
  // tam genişlik ekranın kendisinden (kolon içinde zaten gerilir) gelir.
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  // 'assistant': yalnızca asistana giden düğmelerde; kenarlık vurgu (bakır)
  // rengini alır, yazı ui/Button'ın kendi rengi.
  tone?: 'assistant';
  style?: ViewStyle;
  accessibilityLabel?: string;
}

// Geriye dönük sarmalayıcı: içi ui/Button. Yeni kodda doğrudan `ui/Button`.
export function PrimaryButton({
  label,
  onPress,
  disabled,
  variant = 'primary',
  size = 'md',
  icon,
  tone,
  style,
  accessibilityLabel,
}: Props) {
  const t = useTheme();
  const kind = variant === 'primary' ? 'primary' : 'secondary';
  const assistantBorder: ViewStyle | undefined =
    tone === 'assistant' && kind === 'secondary' ? { borderColor: t.colors.accent } : undefined;
  return (
    <Button
      label={label}
      onPress={onPress}
      disabled={disabled}
      kind={kind}
      size="md"
      icon={icon}
      accessibilityLabel={accessibilityLabel}
      // Eski düğme kapsayıcısını dolduruyordu (Pressable varsayılanı); ui/Button
      // içeriğe sarıyor. Kolon içinde eski davranış korunsun diye geriliyor.
      style={[
        { alignSelf: 'stretch' },
        size === 'sm' ? { paddingHorizontal: t.space[3] } : null,
        assistantBorder,
        style,
      ]}
    />
  );
}
