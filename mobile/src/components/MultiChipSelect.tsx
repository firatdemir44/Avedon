import React from 'react';
import { haptics } from '../features/haptics';
import { useTheme } from '../theme/ThemeContext';
import { Chip, ChipRow } from '../ui';

interface Props {
  options: readonly { key: string; label: string }[];
  values: string[];
  onChange: (values: string[]) => void;
}

// Birden fazla seçilebilen çipler (kullanım amaçları): ui/Chip + ui/ChipRow.
// Seçili çipte onay ikonu var; durum yalnız renkle verilmez. Tek seçimlik
// olanlar için ChipSelect.
export function MultiChipSelect({ options, values, onChange }: Props) {
  const t = useTheme();
  const toggle = (key: string) => {
    haptics.selection();
    onChange(values.includes(key) ? values.filter((v) => v !== key) : [...values, key]);
  };

  return (
    <ChipRow style={{ marginBottom: t.space[4] }}>
      {options.map((option) => {
        const selected = values.includes(option.key);
        return (
          <Chip
            key={option.key}
            label={option.label}
            selected={selected}
            icon={selected ? 'check' : undefined}
            onPress={() => toggle(option.key)}
          />
        );
      })}
    </ChipRow>
  );
}
