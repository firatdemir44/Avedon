import React from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../theme';

interface Props extends TextInputProps {
  label: string;
}

export function TextField({ label, style, multiline, ...inputProps }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        // Tasarımda form alanları tam yuvarlak ve açık mavi dolgulu. Çok satırlı
        // alanda tam yuvarlak köşe metni kenardan kırptığı için orada yumuşak
        // köşe kullanılıyor.
        style={[styles.input, multiline ? styles.multiline : styles.single, style]}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.label,
    color: colors.text,
    marginBottom: spacing.xs,
    marginLeft: spacing.sm,
  },
  input: {
    fontFamily: fonts.regular,
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surfaceTonal,
  },
  single: { borderRadius: radius.md },
  multiline: { borderRadius: radius.md, minHeight: 96, textAlignVertical: 'top' },
});
