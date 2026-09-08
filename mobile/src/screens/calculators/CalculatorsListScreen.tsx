import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'CalculatorsList'>;

const ITEMS: { route: keyof RootStackParamList; title: string; description: string }[] = [
  { route: 'FabricCostCalculator', title: 'Kumaş Maliyeti Hesapla', description: 'İplik fiyatı, gramaj, en, fire ve terbiye maliyetinden ₺/metre ve ₺/kg maliyet' },
  { route: 'GarmentCostCalculator', title: 'Konfeksiyon Ürün Maliyeti Hesapla', description: 'Kumaş tüketimi + işçilik + aksesuar ile birim giysi maliyeti' },
  { route: 'YarnCountCalculator', title: 'İplik Numarası Hesapla / Çevir', description: 'Ne, Nm, Tex, Denye arası çeviri' },
  { route: 'YarnUsageCalculator', title: 'İplik Kullanım Miktarı', description: 'Belirli bir kumaş üretimi için gereken iplik miktarı' },
  { route: 'FabricWeightCalculator', title: 'Kumaş Gramajı Hesapla', description: 'İplik numarası, ilmek boyu ve K faktörü ile gramaj (gr/m²)' },
  { route: 'ProductionCalculator', title: 'Üretim Hesaplama', description: 'Makine hızı, vardiya ve verimlilikten günlük üretim kapasitesi' },
];

export function CalculatorsListScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  cardDescription: {
    fontSize: 13,
    color: colors.textMuted,
  },
});
