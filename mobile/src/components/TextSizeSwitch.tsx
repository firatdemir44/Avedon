import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTextSize, useTheme, type TextSize } from '../theme/ThemeContext';
import { SegmentControl } from '../ui';
import { tr } from '../i18n';

// Yazı boyutu seçimi (hesap menüsünde, Görünüm'ün altında). Uygulama genelinde metinleri büyütür.
const options = (): { value: TextSize; label: string }[] => [
  { value: 'normal', label: tr('Normal') },
  { value: 'buyuk', label: tr('Büyük') },
  { value: 'cokbuyuk', label: tr('Çok büyük') },
];

export function TextSizeSwitch() {
  const t = useTheme();
  const { textSize, setTextSize } = useTextSize();
  return (
    <View style={[styles.row, { gap: t.space[3], minHeight: t.size.touchMin }]}>
      <Text style={[t.type.label14, { color: t.colors.ink2 }]}>{tr('Yazı boyutu')}</Text>
      <SegmentControl options={options()} value={textSize} onChange={setTextSize} accessibilityLabel={tr('Yazı boyutu')} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
