import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import type { RootStackParamList, RootStackScreenProps } from '../../navigation/types';
import { ListRow } from '../../components/ListRow';
import { SectionHeader } from '../../components/SectionHeader';
import { colors, fonts, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'CalculatorsList'>;

type Item = { route: keyof RootStackParamList; title: string; description: string };

// Taslak: docs/tasarim-yonleri/CHesap.dc.html — hesaplar üç başlık altında,
// çizgili satırlar. Taslaktaki liste eski hesaplardandı; burada Örme Parkuru'na
// göre yenilenen güncel hesaplar aynı başlıklara yerleştirildi.
const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: 'Maliyet',
    items: [
      {
        route: 'FabricCostCalculator',
        title: 'Kumaş Maliyeti ve Satış Fiyatı',
        description: 'İplik fiyatı ve oranları, fireler, örme ve boya fasonu, gider ve kârdan ham ve boyalı kumaşın kg fiyatı',
      },
      {
        route: 'GarmentCostCalculator',
        title: 'Konfeksiyon Ürün Maliyeti',
        description: 'Kumaş tüketimi, işçilik ve aksesuarla birim giysi maliyeti',
      },
      {
        route: 'GarmentVisualCost',
        title: 'Görsel Maliyet Tablosu',
        description: 'Kıyafet fotoğrafından bileşenleri bulup miktar ve fiyatla maliyet tablosu çıkarır',
      },
    ],
  },
  {
    title: 'İplik ve kumaş',
    items: [
      {
        route: 'YarnCountCalculator',
        title: 'İplik Numarası Hesapla / Çevir',
        description: 'Ne, Nm, Tex, dtex ve Denye arası çeviri, katlı iplik ve numuneden numara',
      },
      {
        route: 'YarnRatioCalculator',
        title: 'İplik Kullanım Oranı',
        description: 'Pamuk ve likra gibi karışımlarda her ipliğin kumaştaki payı',
      },
      {
        route: 'YarnUsageCalculator',
        title: 'İplik Kullanım Miktarı',
        description: 'Belirli bir kumaş üretimi için gereken iplik miktarı',
      },
      {
        route: 'FabricWeightCalculator',
        title: 'Kumaş Gramajı Hesapla',
        description: 'Kesilen numuneden kesin ya da sıra, çubuk ve ilmek boyundan tahmini gramaj',
      },
    ],
  },
  {
    title: 'Üretim',
    items: [
      {
        route: 'ProductionCalculator',
        title: 'Kumaş Üretimi Hesapla',
        description: 'İğne sayısı, devir, sistem ve iplik bilgisinden saatlik ve günlük kg üretim',
      },
    ],
  },
];

export function CalculatorsListScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Hesaplar sabit formüllerle yapılır. Fiyat, fire ve verimlilik gibi değerleri siz girersiniz; girdiğiniz değerler
          bu cihazda hatırlanır.
        </Text>
        {SECTIONS.map((section, sectionIndex) => (
          <View key={section.title}>
            <SectionHeader title={section.title} first={sectionIndex === 0} />
            <View style={styles.block}>
              {section.items.map((item, index) => (
                <ListRow
                  key={item.route}
                  title={item.title}
                  subtitle={item.description}
                  minHeight={64}
                  divider={index < section.items.length - 1}
                  onPress={() => navigation.navigate(item.route as never)}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  intro: {
    ...typography.label,
    fontFamily: fonts.regular,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingTop: 12,
    paddingBottom: spacing.xs,
  },
  block: { backgroundColor: colors.surface },
});
