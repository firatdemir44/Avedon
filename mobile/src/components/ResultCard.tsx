import React, { useState } from 'react';
import { View, Text, Pressable, type TextStyle, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../ui';
import type { ResultRow } from '../features/assistant/toolResult';
import { locale, tr } from '../i18n';

interface Row {
  label: string;
  value: string;
  /** Etiketin altındaki küçük açıklama (örn. toplam içindeki pay). */
  note?: string;
  /** Öne çıkan satır: üstünde ayırıcı çizgi, daha büyük ve kalın değer. */
  strong?: boolean;
  /** Dikkat çekilen satır (örn. en büyük maliyet kalemi): koyu etiket. */
  highlight?: boolean;
}

// Hesaplayıcı ekranlarının sonuç kutusu: ui/Card ölçüleri (surface-1, 1px
// line, radius-lg), etiket + mono değer; öne çıkan satır mono-20 brand.
export function ResultCard({ rows }: { rows: Row[] }) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: t.colors.surface1,
        borderWidth: 1,
        borderColor: t.colors.line,
        borderRadius: t.radius.lg,
        paddingHorizontal: t.space[4],
        paddingVertical: t.space[2],
        marginTop: t.space[6],
      }}
    >
      {rows.map((row) => (
        <View
          key={row.label}
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: t.space[3],
              paddingVertical: t.space[2],
            },
            row.strong && {
              borderTopWidth: 1,
              borderTopColor: t.colors.lineStrong,
              marginTop: t.space[1],
              paddingTop: t.space[3],
            },
          ]}
        >
          <View style={{ flexShrink: 1 }}>
            <Text
              style={[
                row.strong || row.highlight ? t.type.body16Strong : t.type.body16,
                { color: row.strong || row.highlight ? t.colors.ink : t.colors.ink2 },
              ]}
            >
              {row.label}
            </Text>
            {row.note ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{row.note}</Text> : null}
          </View>
          <Text style={[row.strong ? t.type.mono20 : t.type.mono14, { color: t.colors.brand }]}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

// Asistan sohbetindeki araç sonucu kartı. Kartın içinde kesik çizgili iç
// çerçeve, üstte BÜYÜK HARF caption-12 başlık, sağda birim; altında satırlar.
// Karttaki her rakam ARAÇ ÇIKTISINDAN gelir (model metninden değil) — bkz.
// features/assistant/toolResult.ts.
export function AssistantResultCard({
  title,
  unit,
  rows,
  text,
  formula,
  onProductPress,
  onCompanyPress,
}: {
  title: string;
  unit?: string;
  rows: ResultRow[];
  text?: string;
  formula?: string;
  // Katalog sonucunda ürün satırına dokunma (satıcı asistanı, Faz 2 Adım 3).
  onProductPress?: (productId: string) => void;
  // Kapasite aramasında firma satırına dokunma (Faz 2, Adım 5).
  onCompanyPress?: (companyId: string) => void;
}) {
  const t = useTheme();
  const [openFormula, setOpenFormula] = useState(false);

  const rowBase: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.space[2],
    minHeight: t.space[8],
    paddingVertical: t.space[1],
    borderTopWidth: 1,
    borderTopColor: t.colors.line,
  };
  const label = (strong?: boolean): TextStyle[] => [
    strong ? t.type.body16Strong : t.type.body14,
    { color: t.colors.ink },
  ];
  const value = (strong?: boolean): TextStyle[] => [
    strong ? t.type.mono20 : t.type.mono14,
    { color: strong ? t.colors.brand : t.colors.ink },
  ];

  return (
    <View
      style={{
        backgroundColor: t.colors.surface1,
        borderWidth: 1,
        borderColor: t.colors.line,
        borderRadius: t.radius.lg,
        padding: t.space[1],
      }}
    >
      <View
        style={{
          borderWidth: 1,
          borderColor: t.colors.lineStrong,
          borderStyle: 'dashed',
          borderRadius: t.radius.md,
          paddingHorizontal: t.space[3],
          paddingVertical: t.space[2],
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: t.space[2],
            paddingBottom: t.space[2],
          }}
        >
          <Text style={[t.type.caption12, { color: t.colors.ink3, flexShrink: 1 }]} accessibilityRole="header">
            {title.toLocaleUpperCase(locale())}
          </Text>
          {unit ? <Text style={[t.type.mono14, { color: t.colors.ink3 }]}>{unit}</Text> : null}
        </View>
        {rows.map((row, index) => {
          const body = (
            <>
              <View style={{ flexShrink: 1 }}>
                <Text style={label(row.strong)}>{row.label}</Text>
                {row.note ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{row.note}</Text> : null}
              </View>
              <Text style={value(row.strong)}>{row.value}</Text>
            </>
          );
          const productId = row.productId;
          const companyId = row.companyId;
          const link =
            productId && onProductPress
              ? { onPress: () => onProductPress(productId), target: tr('ürün sayfasını aç') }
              : companyId && onCompanyPress
                ? { onPress: () => onCompanyPress(companyId), target: tr('firma sayfasını aç') }
                : null;
          if (link) {
            // Ürün / firma satırı dokunulabilir: en az 44px ve sonda ok.
            return (
              <Pressable
                key={`${row.label}-${index}`}
                onPress={link.onPress}
                accessibilityRole="button"
                accessibilityLabel={`${row.label}${row.note ? `, ${row.note}` : ''}, ${link.target}`}
                style={({ pressed }) => [
                  rowBase,
                  { minHeight: t.size.touchMin, backgroundColor: pressed ? t.colors.surface2 : 'transparent' },
                ]}
              >
                {body}
                <Icon name="chevron" size={t.size.iconSm} color="ink3" />
              </Pressable>
            );
          }
          return (
            <View
              key={`${row.label}-${index}`}
              style={[rowBase, row.strong && { borderTopColor: t.colors.lineStrong, minHeight: t.size.control }]}
            >
              {body}
            </View>
          );
        })}
        {rows.length === 0 && text ? (
          <Text style={[t.type.body14, { color: t.colors.ink, paddingTop: t.space[1] / 2 }]}>{text}</Text>
        ) : null}
      </View>
      {formula ? (
        <Pressable
          onPress={() => setOpenFormula((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: openFormula }}
          accessibilityLabel={`${tr('Nasıl hesaplandı')}, ${openFormula ? tr('kapat') : tr('aç')}`}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.space[1],
            alignSelf: 'flex-start',
            minHeight: t.size.touchMin,
            paddingHorizontal: t.space[2],
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={[t.type.label14, { color: t.colors.brand }]}>{tr('Nasıl hesaplandı')}</Text>
          <Icon name={openFormula ? 'chevron-up-outline' : 'chevron-down-outline'} size={t.size.iconSm} color="brand" />
        </Pressable>
      ) : null}
      {formula && openFormula ? (
        <Text style={[t.type.body14, { color: t.colors.ink2, paddingHorizontal: t.space[2], paddingBottom: t.space[2] }]}>
          {formula}
        </Text>
      ) : null}
    </View>
  );
}
