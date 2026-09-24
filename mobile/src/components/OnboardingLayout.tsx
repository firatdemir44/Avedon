// Kayıt akışının ortak iskeleti (yeni tasarım, 4. adım — DESIGN.md §1–2, §5).
//
// Üstte ince ilerleme şeridi, isteğe bağlı kenardan kenara şerit (davet
// karşılaması), altında `Screen` ile standart içerik alanı: adım göstergesi
// (caption12/ink3), başlık (title22), açıklama (body16/ink2). `footer` verilirse
// `Screen`in yapışkan alt eylem çubuğunda çizilir (tek dolu düğme oraya gider).
//
// Ham hex / ham px yok: her değer `useTheme()` token'ından.
import React from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Screen } from '../ui';
import { tr } from '../i18n';

interface Props {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  // İlerleme çubuğunun altındaki kenardan kenara şerit (davet karşılaması).
  banner?: React.ReactNode;
}

export function OnboardingLayout({ step, totalSteps, title, subtitle, children, footer, banner }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  return (
    // Üst güvenli alanı burada veriyoruz; alt güvenli alanı `Screen`in yapışkan
    // çubuğu kendisi ekliyor.
    <View style={{ flex: 1, backgroundColor: t.colors.surface0, paddingTop: insets.top }}>
      {/* İlerleme: dolu kısım `brand`, kalanı `surface2`. Ekran okuyucuya oran. */}
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={tr('Adım {step} / {total}', { step, total: totalSteps })}
        style={{
          flexDirection: 'row',
          height: t.space[1],
          backgroundColor: t.colors.surface2,
        }}
      >
        <View style={{ flex: step, backgroundColor: t.colors.brand }} />
        <View style={{ flex: Math.max(0, totalSteps - step) }} />
      </View>
      {banner}
      <Screen sticky={footer}>
        <View style={{ gap: t.space[2], minWidth: 0 }}>
          <Text style={[t.type.caption12, { color: t.colors.ink3 }]}>
            {tr('Adım {step} / {total}', { step, total: totalSteps })}
          </Text>
          <Text style={[t.type.title22, { color: t.colors.ink }]}>{title}</Text>
          {subtitle ? <Text style={[t.type.body16, { color: t.colors.ink2 }]}>{subtitle}</Text> : null}
        </View>
        {children}
      </Screen>
    </View>
  );
}
