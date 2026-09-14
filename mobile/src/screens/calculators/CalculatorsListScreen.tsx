import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import type { MainTabScreenProps, RootStackParamList } from '../../navigation/types';
import { MIN_TOUCH, colors, fonts, radius, shadow, spacing, typography } from '../../theme';

type Props = MainTabScreenProps<'CalculatorsList'>;

const ITEMS: { route: keyof RootStackParamList; title: string; description: string }[] = [
  { route: 'FabricCostCalculator', title: 'Kumaş Maliyeti ve Satış Fiyatı', description: 'İplik fiyatı ve oranları, fireler, örme ve boya fasonu, gider ve kârdan ham ve boyalı kumaşın kg fiyatı' },
  { route: 'GarmentCostCalculator', title: 'Konfeksiyon Ürün Maliyeti Hesapla', description: 'Kumaş tüketimi + işçilik + aksesuar ile birim giysi maliyeti' },
  { route: 'YarnCountCalculator', title: 'İplik Numarası Hesapla / Çevir', description: 'Ne, Nm, Tex, dtex, Denye arası çeviri, katlı iplik ve numuneden numara' },
  { route: 'YarnRatioCalculator', title: 'İplik Kullanım Oranı', description: 'Pamuk ve likra gibi karışımlarda her ipliğin kumaştaki payı' },
  { route: 'YarnUsageCalculator', title: 'İplik Kullanım Miktarı', description: 'Belirli bir kumaş üretimi için gereken iplik miktarı' },
  { route: 'FabricWeightCalculator', title: 'Kumaş Gramajı Hesapla', description: 'Kesilen numuneden kesin ya da sıra, çubuk ve ilmek boyundan tahmini gramaj' },
  { route: 'ProductionCalculator', title: 'Kumaş Üretimi Hesapla', description: 'İğne sayısı, devir, sistem ve iplik bilgisinden saatlik ve günlük kg üretim' },
  {
    route: 'GarmentVisualCost',
    title: 'Görsel Maliyet Tablosu',
    description: 'Kıyafet fotoğrafından bileşenleri tespit edip miktar ve fiyat girerek maliyet tablosu çıkarır',
  },
];

export function CalculatorsListScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>
          Tüm hesaplar sabit formüllerle yapılır. Fiyat, fire ve verimlilik gibi değişken verileri siz girersiniz, sistem tahmin üretmez. Girdiğiniz değerler bu cihazda hatırlanır; değişiklik olduğunda üzerine yazmanız yeterli.
        </Text>
        {ITEMS.map((item) => (
          <Pressable key={item.route} style={styles.card} onPress={() => navigation.navigate(item.route as never)}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardDescription}>{item.description}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
  },
  hint: {
    ...typography.label,
    fontFamily: fonts.regular,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  card: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  cardTitle: {
    ...typography.subtitle,
    fontFamily: fonts.bold,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  cardDescription: {
    ...typography.label,
    fontFamily: fonts.regular,
    color: colors.textMuted,
  },
});
