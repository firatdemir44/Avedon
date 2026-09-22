// Yükleme iskeleti (DESIGN.md §3): surface-2 bloklar, radius-sm. Dönen simge
// yalnızca düğme içinde kullanılır (bkz. Button loading).
import React from 'react';
import { View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  /** Yuvarlak blok (avatar iskeleti). */
  round?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height, round, style }: SkeletonProps) {
  const t = useTheme();
  const h = height ?? t.space[4];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height: h,
          borderRadius: round ? t.radius.full : t.radius.sm,
          backgroundColor: t.colors.surface2,
        },
        style,
      ]}
    />
  );
}

export interface SkeletonTextProps {
  /** Satır sayısı; son satır kısa çizilir. */
  lines?: number;
  style?: StyleProp<ViewStyle>;
}

export function SkeletonText({ lines = 3, style }: SkeletonTextProps) {
  const t = useTheme();
  return (
    <View style={[{ gap: t.space[2] }, style]}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} height={t.space[4]} />
      ))}
    </View>
  );
}

/** Liste satırı iskeleti: avatar + iki metin satırı. */
export function SkeletonRow({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: t.size.row },
        style,
      ]}
    >
      <Skeleton width={t.size.avatar} height={t.size.avatar} round />
      <View style={{ flex: 1, gap: t.space[2] }}>
        <Skeleton width="70%" height={t.space[4]} />
        <Skeleton width="45%" height={t.space[3]} />
      </View>
    </View>
  );
}
