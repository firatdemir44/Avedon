import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

// Blokların üstündeki bölüm başlığı ("Çalışanlar", "Maliyet").
// `count` verilirse eşit aralıklı yazıyla parantez içinde: "Ürünler (12)".
//
// Yeni tasarım (4. adım): `title18` + `ink` (DESIGN.md §5 bölüm başlığı),
// sayı `mono14`. Yeni ekranlar `ui/SectionTitle` kullanır; bu bileşen
// taşınmamış ekranlar için token'a bağlandı.
export function SectionHeader({
  title,
  count,
  first,
  style,
}: {
  title: string;
  count?: number;
  // Ekranın en üstündeki başlıkta üst boşluk daha az.
  first?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const t = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[
        t.type.title18,
        {
          color: t.colors.ink,
          paddingHorizontal: t.space[4],
          paddingTop: first ? t.space[3] : t.space[4],
          paddingBottom: t.space[2],
        },
        style,
      ]}
    >
      {title}
      {count !== undefined ? (
        <Text style={[t.type.mono14, { color: t.colors.ink2 }]}> ({count})</Text>
      ) : null}
    </Text>
  );
}
