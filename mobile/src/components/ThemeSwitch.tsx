import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, useThemePreference, type ThemePreference } from '../theme/ThemeContext';
import { SegmentControl } from '../ui';

// Tema anahtarı (DESIGN.md §1: Hesap sayfasında; varsayılan sistem tercihi).
// Segment kontrolün kendisi src/ui/SegmentControl.tsx'te.
const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Sistem' },
  { value: 'light', label: 'Açık' },
  { value: 'dark', label: 'Koyu' },
];

export function ThemeSwitch() {
  const t = useTheme();
  const { preference, setPreference } = useThemePreference();
  return (
    <View style={[styles.row, { gap: t.space[3], minHeight: t.size.touchMin }]}>
      <Text style={[t.type.label14, { color: t.colors.ink2 }]}>Görünüm</Text>
      <SegmentControl
        options={OPTIONS}
        value={preference}
        onChange={setPreference}
        accessibilityLabel="Görünüm"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
