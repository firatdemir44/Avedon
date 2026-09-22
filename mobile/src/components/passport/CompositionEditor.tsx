import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TextField } from '../TextField';
import { ChipSelect } from '../ChipSelect';
import { FIBERS } from '../../features/products/glossaryLabels';
import { MAX_COMPOSITION_ROWS } from '../../features/products/limits';
import { haptics } from '../../features/haptics';
import { colors } from '../../theme';
import { rowStyles as styles } from './styles';
import { compositionState, emptyCompositionRow, type CompositionRow } from './rows';

const FIBER_OPTIONS = FIBERS.map((f) => ({ value: f.key, label: f.label }));

interface Props {
  rows: CompositionRow[];
  onChange: (rows: CompositionRow[]) => void;
  // Satırların üstünde görünen açıklama (boşsa hiç çizilmez).
  hint?: string;
  // Toplam satırının turuncuya dönmesi (kuralı ekran belirler: kumaşta
  // "100 değil", iplikte "100'den 0,5'ten fazla sapmış").
  totalWarning?: boolean;
  // Toplamın ardına eklenen açıklama (kumaş formundaki parantezli not).
  totalSuffix?: string;
  percentPlaceholder?: string;
  disabled?: boolean;
}

// Bileşim (lif + oran) satır editörü. Kumaş ve iplik formu aynı bileşeni
// kullanır; ekranlar yalnızca satır dizisini tutar.
export function CompositionEditor({
  rows,
  onChange,
  hint,
  totalWarning,
  totalSuffix,
  percentPlaceholder = 'Örn. 100',
  disabled,
}: Props) {
  const { valid, total } = compositionState(rows);

  const updateRow = (key: string, patch: Partial<CompositionRow>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addRow = () => {
    if (rows.length >= MAX_COMPOSITION_ROWS) return;
    haptics.selection();
    onChange([...rows, emptyCompositionRow()]);
  };

  const removeRow = (key: string) => {
    haptics.selection();
    onChange(rows.filter((row) => row.key !== key));
  };

  return (
    <>
      {hint ? <Text style={styles.labelHint}>{hint}</Text> : null}
      {rows.map((row, index) => (
        <View key={row.key} style={styles.rowCard}>
          <View style={styles.rowCardHead}>
            <Text style={styles.rowCardTitle}>{index + 1}. lif</Text>
            <Pressable
              onPress={() => removeRow(row.key)}
              disabled={disabled}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${index + 1}. lif satırını kaldır`}
              style={({ pressed }) => [styles.rowRemove, pressed && styles.rowRemovePressed]}
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
          <ChipSelect
            options={FIBER_OPTIONS}
            value={row.fiber}
            onChange={(fiber) => updateRow(row.key, { fiber })}
            compact
          />
          <TextField
            label="Oran (%)"
            value={row.percent}
            onChangeText={(percent) => updateRow(row.key, { percent })}
            placeholder={percentPlaceholder}
            keyboardType="numeric"
            editable={!disabled}
          />
        </View>
      ))}
      {rows.length < MAX_COMPOSITION_ROWS ? (
        <Pressable
          onPress={addRow}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Lif satırı ekle"
          style={({ pressed }) => [styles.addRow, pressed && styles.addRowPressed]}
        >
          <Ionicons name="add" size={18} color={colors.accent} />
          <Text style={styles.addRowText}>Lif ekle</Text>
        </Pressable>
      ) : null}
      {valid.length ? (
        <Text style={[styles.totalText, totalWarning && styles.totalWarning]}>
          Toplam %{total.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
          {totalSuffix ?? ''}
        </Text>
      ) : null}
    </>
  );
}
