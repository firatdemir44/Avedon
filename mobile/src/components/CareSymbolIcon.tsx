import React from 'react';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import type { CareShape } from '../features/care/symbols';
import { useTheme } from '../theme/ThemeContext';

// Bakım sembolü çizimi. Yol verileri ve koordinatlar herkese açık pasaport
// sayfasındaki `drawCare` ile BİREBİR aynıdır (mobile/public/pasaport.html):
// viewBox 0 0 32 32, stroke 1.6. İkisinden biri değişirse diğeri de değişir.
const BASES: Record<CareShape['base'], string> = {
  tub: 'M3 9 q3.2 -3 6.5 0 t6.5 0 t6.5 0 t6.5 0 M4 9 L7 25 H25 L28 9',
  triangle: 'M16 4 L29 27 H3 Z',
  square: 'M5 5 H27 V27 H5 Z',
  iron: 'M4 24 H28 C28 16 24 12 17 12 H9 M7 17 L9 12',
  circle: '',
};

const INNER: Record<NonNullable<Exclude<CareShape['inner'], 'circle'>>, string> = {
  vline: 'M16 9 V23',
  hline: 'M9 16 H23',
  diag2: 'M11 27 L20.5 11 M17 27 L23.5 16',
  hand: 'M11 21 V14 M14 21 V12 M17 21 V13 M20 21 V15 M11 21 H20',
};

// `color` verilmezse temanın metin rengi (`ink`) kullanılır; böylece koyu temada
// sembol de okunur kalır. Ham hex yok.
export function CareSymbolIcon({
  shape,
  size,
  color,
}: {
  shape: CareShape;
  size?: number;
  color?: string;
}) {
  const t = useTheme();
  const drawColor = color ?? t.colors.ink;
  const drawSize = size ?? t.size.avatarSm;
  const dots: React.ReactNode[] = [];
  if (shape.dots) {
    const cy = shape.base === 'iron' ? 19.5 : 16;
    const start = 16 - (shape.dots - 1) * 2.5;
    for (let i = 0; i < shape.dots; i += 1) {
      dots.push(<Circle key={i} cx={start + i * 5} cy={cy} r={1.3} fill={drawColor} stroke="none" />);
    }
  }

  return (
    <Svg
      width={drawSize}
      height={drawSize}
      viewBox="0 0 32 32"
      fill="none"
      stroke={drawColor}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shape.base === 'circle' ? <Circle cx={16} cy={16} r={11} /> : <Path d={BASES[shape.base]} />}
      {shape.inner === 'circle' ? <Circle cx={16} cy={16} r={8} /> : null}
      {shape.inner && shape.inner !== 'circle' ? <Path d={INNER[shape.inner]} /> : null}
      {shape.text ? (
        <SvgText
          x={16}
          y={shape.base === 'tub' ? 22 : 20.5}
          textAnchor="middle"
          fontSize={shape.base === 'tub' ? 9 : 11}
          fontWeight="700"
          fill={drawColor}
          stroke="none"
        >
          {shape.text}
        </SvgText>
      ) : null}
      {dots}
      {shape.bar ? <Path d="M7 29 H25" /> : null}
      {shape.cross ? <Path d="M4 4 L28 28 M28 4 L4 28" /> : null}
    </Svg>
  );
}
