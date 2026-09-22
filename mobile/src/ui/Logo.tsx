// Avedon simgesi (design/icon.svg'nin küçük hali): iki iç içe "A" halkası.
// Bant içinde kullanıldığı için varsayılan rengi on-brand.
import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';

export interface LogoProps {
  size?: number;
  /** Çizgi rengi; verilmezse on-brand. */
  color?: string;
}

export function Logo({ size, color }: LogoProps) {
  const t = useTheme();
  const d = size ?? t.size.icon;
  const stroke = color ?? t.colors.onBrand;
  return (
    <Svg width={d} height={d} viewBox="0 0 1024 1024" accessibilityLabel="Avedon">
      <Path
        d="M318 660a150 150 0 0 1 0-300a150 150 0 0 1 300 0a150 150 0 0 1 0 300"
        fill="none"
        stroke={stroke}
        strokeWidth={96}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M406 660a150 150 0 0 1 0-300a150 150 0 0 1 300 0a150 150 0 0 1 0 300"
        fill="none"
        stroke={stroke}
        strokeWidth={96}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.55}
      />
    </Svg>
  );
}
