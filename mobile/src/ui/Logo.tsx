// Takyon logosu (2026-09-23): üst banttaki uygulama işareti artık Takyon girdabı (TakyonMark).
// Eski "iki iç içe A" çizimi kaldırıldı. `color` eski çağrılar bozulmasın diye duruyor ama
// işaret kendi marka mavileriyle çizilir (lacivert bant üzerinde de okunur).
import React from 'react';
import { useTheme } from '../theme/ThemeContext';
import { TakyonMark } from './TakyonMark';

export interface LogoProps {
  size?: number;
  /** Eski imza; kullanılmıyor. */
  color?: string;
}

export function Logo({ size }: LogoProps) {
  const t = useTheme();
  return <TakyonMark size={size ?? t.size.icon} />;
}
