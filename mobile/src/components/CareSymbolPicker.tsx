import React from 'react';
import { tr } from '../i18n';
import { View, Text, Pressable } from 'react-native';
import { CareSymbolIcon } from './CareSymbolIcon';
import {
  CARE_GROUPS,
  careSymbolsOfGroup,
  toggleCareSymbol,
  type CareSymbol,
} from '../features/care/symbols';
import { haptics } from '../features/haptics';
import { useTheme } from '../theme/ThemeContext';

// Sembol kutucuğu genişliği (DESIGN.md'de adı olmayan ekran-içi ölçü): 375
// px'te dört kutucuk + aralıklar yan yana sığar.
const CELL_WIDTH = 78;
const SYMBOL_SIZE = 30;

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
  const t = useTheme();
  const press = (symbol: CareSymbol) => {
    haptics.selection();
    onChange(toggleCareSymbol(value, symbol.key));
  };

  return (
    <View style={{ gap: t.space[3] }}>
      <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
        Etiketteki bakım sembollerini seçin. Her gruptan bir tane.
      </Text>
      {CARE_GROUPS.map((group) => (
        <View key={group.key} style={{ gap: t.space[2] }}>
          <Text style={[t.type.label14, { color: t.colors.ink2 }]}>{group.label}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            {careSymbolsOfGroup(group.key).map((symbol) => {
              const selected = value.includes(symbol.key);
              return (
                <Pressable
                  key={symbol.key}
                  onPress={() => press(symbol)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, checked: selected }}
                  accessibilityLabel={symbol.label}
                  accessibilityHint={selected ? tr('Seçimi kaldırmak için dokunun') : undefined}
                  style={({ pressed }) => ({
                    width: CELL_WIDTH,
                    minHeight: t.size.control + t.space[2],
                    alignItems: 'center',
                    gap: t.space[1] / 2,
                    paddingVertical: t.space[2],
                    paddingHorizontal: t.space[1],
                    borderRadius: t.radius.md,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? t.colors.brand : t.colors.lineStrong,
                    backgroundColor: selected
                      ? t.colors.brandSoft
                      : pressed
                        ? t.colors.surface2
                        : t.colors.surface1,
                  })}
                >
                  <CareSymbolIcon
                    shape={symbol.shape}
                    size={SYMBOL_SIZE}
                    color={selected ? t.colors.brand : t.colors.ink}
                  />
                  <Text
                    style={[
                      t.type.caption12,
                      { color: selected ? t.colors.brand : t.colors.ink2, textAlign: 'center' },
                    ]}
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
