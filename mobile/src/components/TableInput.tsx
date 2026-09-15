import React from 'react';
import { TextInput, StyleSheet, type TextInputProps } from 'react-native';
import { MIN_TOUCH, colors, fonts, radius } from '../theme';

// Hesap tablolarında etiketsiz, dar sayı hücresi. Etiket tablo başlığında
// durduğu için ekran okuyucu adı `accessibilityLabel` ile verilmeli.
export function TableInput({ style, ...props }: TextInputProps) {
  return (
    <TextInput
      keyboardType="decimal-pad"
      placeholderTextColor={colors.textMuted}
      {...props}
      style={[styles.input, style]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    fontFamily: fonts.regular,
    minHeight: MIN_TOUCH - 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceTonal,
    paddingHorizontal: 6,
    paddingVertical: 8,
    fontSize: 17,
    color: colors.text,
    textAlign: 'center',
  },
});
