// Hesap araçları (yeni tasarım, 3. adım — DESIGN.md §8, artboard 6 "Hesap araçları + asistan").
//
// Rota adı `Calculators` DEĞİŞMEDİ (başka ekranlar oraya navigate ediyor);
// 2026-09-23'ten beri sekme değil, kök yığında geri oklu ekran. Üstte asistan kartı, altında 2 sütun araç kutuları
// (DESIGN.md §3 "Araç kutusu": 96px, 36px ikon karesi üstte, ad altta),
// en altta "Dünyayı Keşfet". Tema ve hesap işleri ana sayfadaki profil
// avatarının alt sayfasına taşındı (tasarım incelemesi 2026-09-23).
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { RootStackParamList, RootStackScreenProps } from '../../navigation/types';
import { useTheme } from '../../theme/ThemeContext';
import { tr } from '../../i18n';
import { AppBar, Card, Icon, Screen, SectionTitle, type AnyIconName } from '../../ui';

type Props = RootStackScreenProps<'Calculators'>;

type Tool = { route: keyof RootStackParamList; title: string; icon: AnyIconName };

// Rota adları eskisiyle aynı; yalnızca gruplama ve başlıklar artboard 6'ya uydu.
const SECTIONS: { title: string; tools: Tool[] }[] = [
  {
    title: 'Maliyet',
    tools: [
      { route: 'FabricCostCalculator', title: 'Kumaş maliyeti', icon: 'fabric' },
      { route: 'GarmentCostCalculator', title: 'Konfeksiyon maliyeti', icon: 'shirt-outline' },
      { route: 'GarmentVisualCost', title: 'Görselden maliyet tablosu', icon: 'camera' },
      { route: 'ProductionCalculator', title: 'Üretim hesaplama', icon: 'machine' },
    ],
  },
  {
    title: 'İplik ve kumaş',
    tools: [
      { route: 'YarnCountCalculator', title: 'İplik numarası çevir', icon: 'yarn' },
      { route: 'YarnUsageCalculator', title: 'İplik ihtiyacı', icon: 'layers-outline' },
      { route: 'YarnRatioCalculator', title: 'İplik kullanım oranı', icon: 'pie-chart-outline' },
      { route: 'FabricWeightCalculator', title: 'Kumaş gramajı', icon: 'scale' },
    ],
  },
];

export function CalculatorsListScreen({ navigation }: Props) {
  const t = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title={tr('Hesap araçları')} leading="back" onBack={() => navigation.goBack()} />
      <Screen>
        {/* Asistan kartı: artboard 6'da lacivert dolu kart. Kart olduğu için
            "ekranda en fazla 1 dolu düğme" kuralını bozmuyor. */}
        <Pressable
          onPress={() => navigation.navigate('MainTabs', { screen: 'AssistantTab' })}
          accessibilityRole="button"
          accessibilityLabel={tr('Tekstil asistanına sor')}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.space[3],
            padding: t.space[4],
            borderRadius: t.radius.lg,
            backgroundColor: pressed ? t.colors.brandStrong : t.colors.surfaceBrand,
            minWidth: 0,
          })}
        >
          <View
            style={{
              width: t.size.avatar,
              height: t.size.avatar,
              borderRadius: t.radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: t.colors.brandStrong,
            }}
          >
            <Icon name="sparkles-outline" size={t.size.iconSm} colorValue={t.colors.onBrand} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: t.space[1] }}>
            <Text style={[t.type.body16Strong, { color: t.colors.onBrand }]}>{tr('Tekstil asistanına sor')}</Text>
            <Text numberOfLines={2} style={[t.type.body14, { color: t.colors.onBrand }]}>
              {tr('Örme, boyama, iplik… ne takıldıysa yazın.')}
            </Text>
          </View>
          <Icon name="chevron" colorValue={t.colors.onBrand} />
        </Pressable>

        {SECTIONS.map((section) => (
          <View key={section.title} style={{ gap: t.space[3] }}>
            <SectionTitle title={tr(section.title)} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[3] }}>
              {section.tools.map((tool) => (
                <ToolBox
                  key={tool.route}
                  tool={tool}
                  onPress={() => navigation.navigate(tool.route as never)}
                />
              ))}
            </View>
          </View>
        ))}

        <View style={{ gap: t.space[3] }}>
          <SectionTitle title={tr('Dış pazar')} />
          <Card onPress={() => navigation.navigate('ExportRadar')} accessibilityLabel={tr('Dünyayı Keşfet')} testID="tools-export-radar">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
              <View
                style={{
                  width: t.size.avatar,
                  height: t.size.avatar,
                  borderRadius: t.radius.md,
                  backgroundColor: t.colors.brandSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="globe-outline" color="brand" />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: t.space[1] }}>
                <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>{tr('Dünyayı Keşfet')}</Text>
                <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{tr('Ürününüzü hangi ülkelere satabilirsiniz?')}</Text>
              </View>
            </View>
          </Card>
        </View>

        <Text style={[t.type.body14, { color: t.colors.ink3 }]}>
          {tr('Hesaplar sabit formüllerle yapılır. Fiyat, fire ve verimlilik gibi değerleri siz girersiniz; girdiğiniz değerler bu cihazda hatırlanır.')}
        </Text>
      </Screen>
    </View>
  );
}

// DESIGN.md §3 "Araç kutusu": 96px, 36px ikon karesi üstte, ad altta; 2 sütun.
function ToolBox({ tool, onPress }: { tool: Tool; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={tr(tool.title)}
      style={({ pressed }) => ({
        // İki sütun: satırın yarısı eksi aradaki boşluğun yarısı.
        flexBasis: '47%',
        flexGrow: 1,
        minWidth: 0,
        minHeight: t.size.toolBox,
        gap: t.space[2],
        padding: t.space[3],
        borderRadius: t.radius.lg,
        borderWidth: 1,
        borderColor: t.colors.line,
        backgroundColor: pressed ? t.colors.surface2 : t.colors.surface1,
      })}
    >
      <View
        style={{
          width: t.size.chip,
          height: t.size.chip,
          borderRadius: t.radius.md,
          backgroundColor: t.colors.brandSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={tool.icon} size={t.size.iconSm} color="brand" />
      </View>
      <Text numberOfLines={2} style={[t.type.label14, { color: t.colors.ink }]}>
        {tr(tool.title)}
      </Text>
    </Pressable>
  );
}
