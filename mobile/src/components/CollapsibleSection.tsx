import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MIN_TOUCH, colors, fonts, spacing, typography } from '../theme';

// Daraltılabilir bölüm başlığı: SectionHeader ile aynı gri küçük başlık, ama
// dokunulabilir ve sonunda chevron. Uzun formlarda (ürün kartındaki İplik ve
// Sertifikalar) varsayılan kapalı gelen bölümler için.
export function CollapsibleSection({
  title,
  count,
  open,
  onToggle,
  first,
  children,
}: {
  title: string;
  // Verilirse başlıkta eşit aralıklı yazıyla: "İplik (2)".
  count?: number;
  open: boolean;
  onToggle: () => void;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}${count !== undefined ? `, ${count}` : ''}, ${open ? 'kapat' : 'aç'}`}
        style={({ pressed }) => [styles.header, first && styles.first, pressed && styles.pressed]}
      >
        <Text style={styles.title}>
          {title}
          {count !== undefined ? <Text style={styles.count}> ({count})</Text> : null}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.chevron} />
      </Pressable>
      {open ? children : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
    paddingBottom: 6,
  },
  first: { paddingTop: 12 },
  pressed: { opacity: 0.6 },
  title: { ...typography.label, fontFamily: fonts.semibold, color: colors.textMuted },
  count: { fontFamily: fonts.monoMedium },
});
