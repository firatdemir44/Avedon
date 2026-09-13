import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import type { MainTabScreenProps, RootStackParamList } from '../../navigation/types';
import { MIN_TOUCH, colors, radius, shadow, spacing, typography } from '../../theme';

type Props = MainTabScreenProps<'CalculatorsList'>;

const ITEMS: { route: keyof RootStackParamList; title: string; description: string }[] = [
  { route: 'FabricCostCalculator', title: 'Kumaş Maliyeti Hesapla', description: 'İplik fiyatı, gramaj, en, fire ve terbiye maliyetinden ₺/metre ve ₺/kg maliyet' },
  { route: 'GarmentCostCalculator', title: 'Konfeksiyon Ürün Maliyeti Hesapla', description: 'Kumaş tüketimi + işçilik + aksesuar ile birim giysi maliyeti' },
  { route: 'YarnCountCalculator', title: 'İplik Numarası Hesapla / Çevir', description: 'Ne, Nm, Tex, Denye arası çeviri' },
  { route: 'YarnUsageCalculator', title: 'İplik Kullanım Miktarı', description: 'Belirli bir kumaş üretimi için gereken iplik miktarı' },
  { route: 'FabricWeightCalculator', title: 'Kumaş Gramajı Hesapla', description: 'İplik numarası, ilmek boyu ve K faktörü ile gramaj (gr/m²)' },
  { route: 'ProductionCalculator', title: 'Üretim Hesaplama', description: 'Makine hızı, vardiya ve verimlilikten günlük üretim kapasitesi' },
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
          Tüm hesaplar sabit formüllerle yapılır — fiyat, fire ve verimlilik gibi değişken verileri siz girersiniz, sistem tahmin üretmez. Girdiğiniz değerler bu cihazda hatırlanır, bir dahaki sefere yeniden girmenize gerek kalmaz — değişiklik olduğunda üzerine yazmanız yeterli.
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
    fontWeight: '400',
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
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  cardDescription: {
    ...typography.label,
    fontWeight: '400',
    color: colors.textMuted,
  },
});
