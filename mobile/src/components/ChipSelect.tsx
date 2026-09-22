import React from 'react';
import { useTheme } from '../theme/ThemeContext';
import { Chip, ChipRow } from '../ui';

interface Props<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  // Eski "küçük çip" seçeneği; yeni tasarımda çip tek ölçü (36px pill),
  // yalnızca alt boşluk daralır. Geriye dönük uyum için duruyor.
  compact?: boolean;
}

// Birbirini dışlayan seçenekler: ui/Chip + ui/ChipRow (DESIGN.md §3, yatay
// kaydırılır, satır kırmaz). Seçili çip brand zemin + on-brand metin.
export function ChipSelect<T extends string>({ options, value, onChange, compact }: Props<T>) {
  const t = useTheme();
  return (
    <ChipRow style={{ marginBottom: compact ? t.space[2] : t.space[4] }}>
      {options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          selected={option.value === value}
          onPress={() => onChange(option.value)}
        />
      ))}
    </ChipRow>
  );
}
