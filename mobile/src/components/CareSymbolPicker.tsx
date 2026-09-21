import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { CareSymbolIcon } from './CareSymbolIcon';
import {
  CARE_GROUPS,
  careSymbolsOfGroup,
  toggleCareSymbol,
  type CareSymbol,
} from '../features/care/symbols';
import { haptics } from '../features/haptics';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../theme';

// Etiketteki bakım sembolleri: beş grup alt alta, her grupta kutucuklar
// sarılarak dizilir. Bir gruptan en çok BİR sembol seçilir; seçili kutucuğa
// yeniden basmak seçimi kaldırır (kural tek yerde: toggleCareSymbol).
export function CareSymbolPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const press = (symbol: CareSymbol) => {
    haptics.selection();
    onChange(toggleCareSymbol(value, symbol.key));
  };

  return (
    <View>
      <Text style={styles.hint}>Etiketteki bakım sembollerini seçin. Her gruptan bir tane.</Text>
      {CARE_GROUPS.map((group) => (
        <View key={group.key} style={styles.group}>
          <Text style={styles.groupTitle}>{group.label}</Text>
          <View style={styles.grid}>
            {careSymbolsOfGroup(group.key).map((symbol) => {
              const selected = value.includes(symbol.key);
              return (
                <Pressable
                  key={symbol.key}
                  onPress={() => press(symbol)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, checked: selected }}
                  accessibilityLabel={symbol.label}
                  accessibilityHint={selected ? 'Seçimi kaldırmak için dokunun' : undefined}
                  style={({ pressed }) => [
                    styles.cell,
                    selected && styles.cellSelected,
                    pressed && styles.cellPressed,
                  ]}
                >
                  <CareSymbolIcon
                    shape={symbol.shape}
                    size={30}
                    color={selected ? colors.primary : colors.text}
                  />
                  <Text
                    style={[styles.cellLabel, selected && styles.cellLabelSelected]}
                    numberOfLines={2}
                  >
                    {symbol.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { ...typography.caption, color: colors.textMuted, paddingBottom: spacing.sm },
  group: { paddingTop: spacing.sm },
  groupTitle: { ...typography.label, fontFamily: fonts.semibold, color: colors.textMuted, paddingBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  cell: {
    width: 84,
    minHeight: MIN_TOUCH + 12,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cellSelected: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.accentSoft },
  cellPressed: { backgroundColor: colors.pressed },
  cellLabel: { ...typography.caption, fontSize: 11, lineHeight: 14, color: colors.textMuted, textAlign: 'center' },
  cellLabelSelected: { color: colors.primary, fontFamily: fonts.semibold },
});
