import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, useThemePreference, type ThemePreference } from '../theme/ThemeContext';
import { SegmentControl } from '../ui';
import { getLang, tr } from '../i18n';

// Tema anahtarı (DESIGN.md §1: ana sayfadaki profil avatarının alt sayfasında; varsayılan sistem tercihi).
// Segment kontrolün kendisi src/ui/SegmentControl.tsx'te.
const options = (): { value: ThemePreference; label: string }[] => [
  // 'Açık' başka yerlerde 'Open' anlamında çevrildiği için tema etiketleri burada sabit.
  { value: 'system', label: getLang() === 'en' ? 'System' : 'Sistem' },
  { value: 'light', label: getLang() === 'en' ? 'Light' : 'Açık' },
  { value: 'dark', label: getLang() === 'en' ? 'Dark' : 'Koyu' },
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
