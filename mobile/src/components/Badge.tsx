import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, fonts, radius, spacing, typography } from '../theme';

interface Props {
  label: string;
  // solid: dolu vurgu (durum rozeti) · soft: tonlu zemin (bilgi rozeti)
  // outline: sadece çerçeve (ikincil sınıflandırma, örn. ürün tipi)
  tone?: 'solid' | 'soft' | 'outline';
  style?: ViewStyle;
}

// Tasarımdaki hap rozetler. Uygulamada aynı görünüm sekiz ayrı ekranda
// kopyalanmıştı; tek yerde toplandı.
export function Badge({ label, tone = 'soft', style }: Props) {
  return (
    <View style={[styles.base, styles[tone], style]}>
      <Text style={[styles.text, tone === 'solid' && styles.textSolid]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  solid: { backgroundColor: colors.primary },
  soft: { backgroundColor: colors.accentSoft },
  outline: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  text: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    color: colors.primary,
  },
  textSolid: { color: colors.primaryText },
});
