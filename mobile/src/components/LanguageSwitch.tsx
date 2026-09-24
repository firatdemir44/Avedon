import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useI18n, type Lang } from '../i18n';
import { SegmentControl } from '../ui';

// Dil seçimi (hesap alt sayfası). Dil adları kendi dilinde yazılır (çevrilmez).
const OPTIONS: { value: Lang; label: string }[] = [
  { value: 'tr', label: 'Türkçe' },
  { value: 'en', label: 'English' },
];

export function LanguageSwitch() {
  const t = useTheme();
  const { lang, setLang, t: tt } = useI18n();
  return (
    <View style={[styles.row, { gap: t.space[3], minHeight: t.size.touchMin }]}>
      <Text style={[t.type.label14, { color: t.colors.ink2 }]}>{tt('Dil')}</Text>
      <SegmentControl options={OPTIONS} value={lang} onChange={setLang} accessibilityLabel={tt('Dil')} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
