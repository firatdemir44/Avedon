import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, useThemePreference, type ThemePreference } from '../theme/ThemeContext';

// Tema anahtarı (DESIGN.md §1: Hesap sayfasında; varsayılan sistem tercihi).
// Segment kontrol: --surface-2 zemin, 4px iç boşluk, öğe 36px, seçili --surface-1 + 1px --line.
const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Sistem' },
  { value: 'light', label: 'Açık' },
  { value: 'dark', label: 'Koyu' },
];

export function ThemeSwitch() {
  const t = useTheme();
  const { preference, setPreference } = useThemePreference();
  return (
    <View style={styles.row}>
      <Text style={[t.type.label14, { color: t.colors.ink2 }]}>Görünüm</Text>
      <View style={[styles.segment, { backgroundColor: t.colors.surface2, borderRadius: t.radius.md, padding: t.space[1] }]} accessibilityRole="radiogroup">
        {OPTIONS.map((o) => {
          const on = o.value === preference;
          return (
            <Pressable
              key={o.value}
              onPress={() => setPreference(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`Görünüm: ${o.label}`}
              style={[
                styles.item,
                { borderRadius: t.radius.sm, minHeight: 36, paddingHorizontal: t.space[3] },
                on && { backgroundColor: t.colors.surface1, borderWidth: 1, borderColor: t.colors.line },
              ]}
            >
              <Text style={[t.type.label14, { color: on ? t.colors.ink : t.colors.ink2 }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  segment: { flexDirection: 'row' },
  item: { alignItems: 'center', justifyContent: 'center' },
});
