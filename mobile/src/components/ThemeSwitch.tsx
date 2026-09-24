import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, useThemePreference, type ThemePreference } from '../theme/ThemeContext';
import { SegmentControl } from '../ui';
import { tr } from '../i18n';

// Tema anahtarı (DESIGN.md §1: ana sayfadaki profil avatarının alt sayfasında; varsayılan sistem tercihi).
// Segment kontrolün kendisi src/ui/SegmentControl.tsx'te.
const options = (): { value: ThemePreference; label: string }[] => [
  { value: 'system', label: tr('Sistem') },
  { value: 'light', label: tr('Açık') },
  { value: 'dark', label: tr('Koyu') },
];

export function ThemeSwitch() {
  const t = useTheme();
  const { preference, setPreference } = useThemePreference();
  return (
    <View style={[styles.row, { gap: t.space[3], minHeight: t.size.touchMin }]}>
      <Text style={[t.type.label14, { color: t.colors.ink2 }]}>{tr('Görünüm')}</Text>
      <SegmentControl
        options={options()}
        value={preference}
        onChange={setPreference}
        accessibilityLabel={tr('Görünüm')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
