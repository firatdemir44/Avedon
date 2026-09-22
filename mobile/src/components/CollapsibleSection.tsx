import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../ui';

// Daraltılabilir bölüm başlığı: title-18 (DESIGN.md §5 bölüm başlığı), 44px
// dokunma hedefi, sonunda chevron. Uzun formlarda (ürün kartındaki İplik ve
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
  const t = useTheme();
  return (
    <View>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}${count !== undefined ? `, ${count}` : ''}, ${open ? 'kapat' : 'aç'}`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: t.space[3],
          minHeight: t.size.touchMin,
          paddingTop: first ? t.space[3] : t.space[4],
          paddingBottom: t.space[2],
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text style={[t.type.title18, { color: t.colors.ink, flexShrink: 1 }]} accessibilityRole="header">
          {title}
          {count !== undefined ? (
            <Text style={[t.type.mono14, { color: t.colors.ink2 }]}> ({count})</Text>
          ) : null}
        </Text>
        <Icon name={open ? 'chevron-up-outline' : 'chevron-down-outline'} color="ink3" />
      </Pressable>
      {open ? children : null}
    </View>
  );
}
