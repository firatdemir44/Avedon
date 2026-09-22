import React from 'react';
import { TextInput, StyleSheet, type TextInputProps } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

// Hesap tablolarında etiketsiz, dar sayı hücresi. Etiket tablo başlığında
// durduğu için ekran okuyucu adı `accessibilityLabel` ile verilmeli.
// Ölçüler DESIGN.md §3 "Giriş alanı": 48px (`size.control`), `radius.md`,
// 1px `lineStrong`, zemin `surface1`, metin `body16` `ink`, ortalı.
export const TableInput = React.forwardRef<TextInput, TextInputProps>(function TableInput(
  { style, ...props },
  ref
) {
  const t = useTheme();
  return (
    <TextInput
      ref={ref}
      keyboardType="decimal-pad"
      placeholderTextColor={t.colors.ink3}
      {...props}
      style={[
        styles.shrinkable,
        t.type.body16,
        {
          minHeight: t.size.control,
          borderWidth: 1,
          borderColor: t.colors.lineStrong,
          borderRadius: t.radius.md,
          backgroundColor: t.colors.surface1,
          paddingHorizontal: t.space[2],
          paddingVertical: t.space[2],
          color: t.colors.ink,
          textAlign: 'center',
        },
        style,
      ]}
    />
  );
});

const styles = StyleSheet.create({
  // Web'de <input> öğesinin kendi asgari genişliği (~200 px) var; minWidth 0 olmazsa flex sütunu
  // daralmaz ve yanındaki hücreleri ekran dışına iter (2026-09-21: "% kısmına rakam giremedim").
  shrinkable: { minWidth: 0 },
});
