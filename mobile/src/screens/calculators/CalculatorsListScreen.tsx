import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { RootStackParamList, MainTabScreenProps } from '../../navigation/types';
import { SectionHeader } from '../../components/SectionHeader';
import { ThemeSwitch } from '../../components/ThemeSwitch';
import { colors, fonts, radius, spacing, typography } from '../../theme';

type Props = MainTabScreenProps<'Calculators'>;

// İkon iki ailenin birinden gelebiliyor: Ionicons yetmediği yerde
// MaterialCommunityIcons (makara, terazi, çark). Yeni paket kurulmadı.
type IconSpec =
  | { family: 'ion'; name: React.ComponentProps<typeof Ionicons>['name'] }
  | { family: 'mci'; name: React.ComponentProps<typeof MaterialCommunityIcons>['name'] };

type Item = {
  route: keyof RootStackParamList;
  title: string;
  description: string;
  icon: IconSpec;
};

// Fırat 2026-09-21: hesaplar alt alta yazı listesi yerine sembollü kare
// düğmeler olsun; sembolün altında "ne iş yapar" tek satırda yazsın.
// Rota adları eskisiyle aynı; yalnızca başlık/açıklama kısaldı.
const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: 'Maliyet',
    items: [
      {
        route: 'FabricCostCalculator',
        title: 'Kumaş maliyeti',
        description: 'İplik, örme, boya: satış fiyatı ve kâr',
        icon: { family: 'mci', name: 'cash-multiple' },
      },
      {
        route: 'GarmentCostCalculator',
        title: 'Konfeksiyon maliyeti',
        description: 'Kumaş, kesim, dikim, aksesuar: parça maliyeti',
        icon: { family: 'ion', name: 'shirt-outline' },
      },
      {
        route: 'GarmentVisualCost',
        title: 'Görselden maliyet',
        description: 'Fotoğraftan parça listesi ve maliyet tablosu',
        icon: { family: 'ion', name: 'camera-outline' },
      },
    ],
  },
  {
    title: 'İplik ve kumaş',
    items: [
      {
        route: 'YarnCountCalculator',
        title: 'İplik numarası',
        description: 'Ne, Nm, denye, dtex arası çevir ve hesapla',
        icon: { family: 'ion', name: 'swap-horizontal-outline' },
      },
      {
        route: 'YarnRatioCalculator',
        title: 'İplik kullanım oranı',
        description: 'Kumaşta hangi iplik yüzde kaç',
        icon: { family: 'ion', name: 'pie-chart-outline' },
      },
      {
        route: 'YarnUsageCalculator',
        title: 'İplik ihtiyacı',
        description: 'Sipariş için kaç kilo iplik gerekir',
        // MCI'de "spool" (makara) bu sürümde yok; katman ikonu yedek.
        icon: { family: 'ion', name: 'layers-outline' },
      },
      {
        route: 'FabricWeightCalculator',
        title: 'Kumaş gramajı',
        description: 'Numuneden ya da örgü ayarından gr/m²',
        icon: { family: 'mci', name: 'scale-balance' },
      },
    ],
  },
  {
    title: 'Üretim',
    items: [
      {
        route: 'ProductionCalculator',
        title: 'Kumaş üretimi',
        description: 'Makine başına günlük kilo ve metre',
        icon: { family: 'mci', name: 'cog-outline' },
      },
    ],
  },
];

const GRID_GAP = spacing.sm;
const ICON_SIZE = 34;
const ICON_CIRCLE = 60;

function columnsFor(width: number) {
  if (width >= 1000) return 4;
  if (width >= 700) return 3;
  return 2;
}

function CalculatorIcon({ icon }: { icon: IconSpec }) {
  if (icon.family === 'mci') {
    return <MaterialCommunityIcons name={icon.name} size={ICON_SIZE} color={colors.primary} />;
  }
  return <Ionicons name={icon.name} size={ICON_SIZE} color={colors.primary} />;
}

export function CalculatorsListScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const columns = columnsFor(width);
  // Izgara `gutter` iç boşluğunun içinde; kartlar eşit genişlikte, aralar eşit.
  const available = Math.max(width - spacing.gutter * 2, 240);
  const cardWidth = Math.floor((available - GRID_GAP * (columns - 1)) / columns);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.introText}>Hesabı buradan yapın ya da Asistan'a yazarak sorun.</Text>
          {/* Tek Pressable: iç içe düğme yok (web). */}
          <Pressable
            onPress={() => navigation.navigate('AssistantTab')}
            accessibilityRole="link"
            accessibilityLabel="Asistan'a sor"
            hitSlop={8}
            style={({ pressed }) => [styles.assistantLink, pressed && styles.linkPressed]}
          >
            <Ionicons name="sparkles-outline" size={16} color={colors.accent} />
            <Text style={styles.assistantLinkText}>Asistan'a sor</Text>
          </Pressable>
        </View>

        <View style={styles.themeRow}>
          <ThemeSwitch />
        </View>

        {SECTIONS.map((section, sectionIndex) => (
          <View key={section.title}>
            <SectionHeader title={section.title} first={sectionIndex === 0} />
            <View style={styles.grid}>
              {section.items.map((item) => (
                <Pressable
                  key={item.route}
                  onPress={() => navigation.navigate(item.route as never)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}. ${item.description}`}
                  style={({ pressed }) => [styles.card, { width: cardWidth }, pressed && styles.cardPressed]}
                >
                  <View style={styles.iconCircle}>
                    <CalculatorIcon icon={item.icon} />
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.cardDescription} numberOfLines={2}>
                    {item.description}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.footNote}>
          Hesaplar sabit formüllerle yapılır. Fiyat, fire ve verimlilik gibi değerleri siz girersiniz; girdiğiniz
          değerler bu cihazda hatırlanır.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  themeRow: { paddingHorizontal: spacing.gutter, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  intro: {
    paddingHorizontal: spacing.gutter,
    paddingTop: 12,
    paddingBottom: spacing.xs,
    gap: spacing.xs,
  },
  introText: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  assistantLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    minHeight: 28,
    borderRadius: radius.sm,
  },
  linkPressed: { opacity: 0.6 },
  assistantLinkText: { ...typography.label, color: colors.accent },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.xs,
  },
  // Beyaz kart: 6px köşe, ince çerçeve, gölgesiz (C · Pazar Masası).
  // Kartlar aynı yükseklikte olsun diye sabit alt sınır + iki satırlık metinler.
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    minHeight: 176,
    justifyContent: 'flex-start',
  },
  cardPressed: { backgroundColor: colors.pressed },
  iconCircle: {
    width: ICON_CIRCLE,
    height: ICON_CIRCLE,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  cardTitle: {
    ...typography.label,
    fontFamily: fonts.semibold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  // İki satırlık yer ayrılır ki tek satırlık açıklamalarda da kartlar
  // aynı hizada bitsin.
  cardDescription: {
    ...typography.caption,
    fontSize: 12,
    lineHeight: 16,
    minHeight: 32,
    color: colors.textMuted,
    textAlign: 'center',
  },
  footNote: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
  },
});
