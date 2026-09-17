import React from 'react';
import { View, Text, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StockDot, formatStock } from './StockIndicator';
import { formatMeasure } from '../features/calculators/parse';
import { STOCK_UNIT_LABELS, subtypeLabel, typeLabel, type StockUnit } from '../features/products/catalog';
import {
  certificateLabel,
  effectiveWidthCm,
  formatComposition,
  widthHintLabel,
} from '../features/products/glossaryLabels';
import type { CompositionItem } from '../types';
import { colors, fonts, radius, spacing, typography } from '../theme';

// Kumaş pasaportu kartı (Faz 1, Adım 6; taslak docs/tasarim-2027/Main.dc.html).
// Akış kartında ürünün özeti: beyaz kutu, içinde kesik çizgili iç çerçeve.
// Ayrı bileşen çünkü ileride ürün sayfası ve asistan sonuçları da aynı kartı
// kullanacak; bu yüzden sunucu tipine değil bu sade arayüze bağlı.
export interface PassportCardProduct {
  code: string;
  type: string;
  subtype: string;
  weightGsm: number;
  widthCm: number;
  widthType: string;
  // '' | 'acik' | 'tup_tek_yuz'; En sütununun altındaki ipucunu belirler.
  widthMeaning: string;
  stock: number;
  stockUnit: StockUnit;
  moq: number | null;
  moqUnit: string;
  leadTimeDays: number | null;
  composition: CompositionItem[];
  certificateNames: string[];
}

// Kartı besleyen kaynak: akış ürünü (FeedProduct, alanların hepsi dolu) ya da
// ürün sayfasındaki ProductDetail (pasaport alanları isteğe bağlı). Tek eşleme
// olsun diye ikisini de kapsayan gevşek bir arayüz.
export interface PassportCardSource {
  code: string;
  type: string;
  subtype?: string | null;
  weightGsm: number;
  widthCm: number;
  widthType?: string | null;
  widthMeaning?: string | null;
  stock: number;
  stockUnit: StockUnit;
  moq?: number | null;
  moqUnit?: string | null;
  leadTimeDays?: number | null;
  composition?: CompositionItem[] | null;
  certificateNames?: string[] | null;
  // Detay yanıtı sertifikaların tamamını taşır; adlar yoksa buradan alınır.
  certificates?: { name: string }[] | null;
}

export function toPassportCardProduct(product: PassportCardSource): PassportCardProduct {
  const certificateNames =
    product.certificateNames ?? (product.certificates ?? []).map((certificate) => certificate.name);
  return {
    code: product.code,
    type: product.type,
    subtype: product.subtype ?? '',
    weightGsm: product.weightGsm,
    widthCm: product.widthCm,
    widthType: product.widthType ?? '',
    widthMeaning: product.widthMeaning ?? '',
    stock: product.stock,
    stockUnit: product.stockUnit,
    moq: product.moq ?? null,
    moqUnit: product.moqUnit ?? '',
    leadTimeDays: product.leadTimeDays ?? null,
    composition: product.composition ?? [],
    certificateNames,
  };
}

// Örgü kumaşlarda sütun başlığı "Örgü", dokuma ve diğerinde "Çeşit"
// (taslaktaki örnek raschel olduğu için "Örgü" yazıyordu).
function structureLabel(type: string) {
  return type === 'dokuma' || type === 'diger' ? 'Çeşit' : 'Örgü';
}

// "1.200 m · MOQ 300 m · 12 gün"
function commercialSummary(product: PassportCardProduct) {
  const parts = [formatStock(product.stock, product.stockUnit)];
  if (product.moq != null) {
    const unit = product.moqUnit ? STOCK_UNIT_LABELS[product.moqUnit as StockUnit]?.short ?? product.moqUnit : '';
    parts.push(`MOQ ${formatMeasure(product.moq)}${unit ? ` ${unit}` : ''}`);
  }
  if (product.leadTimeDays != null) parts.push(`${product.leadTimeDays} gün`);
  return parts.join(' · ');
}

export function passportAccessibilityLabel(product: PassportCardProduct) {
  const structure = subtypeLabel(product.type, product.subtype) || typeLabel(product.type);
  const composition = product.composition.length ? `, ${formatComposition(product.composition)}` : '';
  const effective =
    product.widthMeaning === 'tup_tek_yuz'
      ? `, tek yüz tüp eni, hesap eni ${formatMeasure(effectiveWidthCm(product.widthCm, product.widthMeaning))} santim`
      : '';
  return `Kumaş pasaportu. ${product.code}, ${structure}, ${formatMeasure(
    product.weightGsm
  )} gram metrekare, ${formatMeasure(product.widthCm)} santim en${effective}${composition}, ${commercialSummary(
    product
  )}`;
}

export function PassportCard({
  product,
  onPress,
  style,
}: {
  product: PassportCardProduct;
  // Verilmezse kart dokunulamaz olur (ürün sayfasının kendi içinde olduğu gibi).
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const structure = subtypeLabel(product.type, product.subtype) || typeLabel(product.type);
  // "tüp, tek yüz" / "tüp, açık en" / "tüp en" / "açık en"
  const widthHint = widthHintLabel(product.widthType, product.widthMeaning);
  const composition = product.composition.length ? formatComposition(product.composition) : '';
  const certificates = product.certificateNames ?? [];

  const inner = (
    <View style={styles.inner}>
      <View style={styles.topRow}>
        <Text style={styles.code} numberOfLines={1}>
          {product.code}
        </Text>
        <Text style={styles.kicker} numberOfLines={1}>
          KUMAŞ PASAPORTU
        </Text>
      </View>

      <View style={styles.specRow}>
        <View style={styles.specCell}>
          <Text style={styles.specLabel}>Gramaj</Text>
          <Text style={styles.specValue} numberOfLines={1}>
            {formatMeasure(product.weightGsm)} g/m²
          </Text>
        </View>
        <View style={styles.specCell}>
          <Text style={styles.specLabel}>En</Text>
          <Text style={styles.specValue} numberOfLines={1}>
            {formatMeasure(product.widthCm)} cm
          </Text>
          {widthHint ? (
            <Text style={styles.specHint} numberOfLines={1}>
              {widthHint}
            </Text>
          ) : null}
        </View>
        <View style={styles.specCell}>
          <Text style={styles.specLabel}>{structureLabel(product.type)}</Text>
          <Text style={styles.specValue} numberOfLines={1}>
            {structure}
          </Text>
        </View>
      </View>

      <View style={styles.bottomRow}>
        <Text style={styles.composition} numberOfLines={1}>
          {composition}
        </Text>
        <View style={styles.commercial}>
          <StockDot stock={product.stock} unit={product.stockUnit} />
          <Text style={styles.commercialText} numberOfLines={1}>
            {commercialSummary(product)}
          </Text>
        </View>
      </View>

      {certificates.length ? (
        <View style={styles.certRow}>
          {certificates.map((name) => (
            <View key={name} style={styles.certBadge}>
              <Ionicons name="ribbon-outline" size={11} color={colors.success} />
              <Text style={styles.certText} numberOfLines={1}>
                {certificateLabel(name)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return <View style={[styles.frame, style]}>{inner}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${passportAccessibilityLabel(product)}. Ürün sayfasını aç`}
      android_ripple={{ color: colors.pressed }}
      style={({ pressed }) => [styles.frame, pressed && styles.pressed, style]}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: 4,
  },
  pressed: { backgroundColor: colors.pressed },
  inner: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: 10,
    gap: 6,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  code: { fontFamily: fonts.monoSemibold, fontSize: 15, lineHeight: 20, color: colors.primary, flexShrink: 1 },
  kicker: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 15, letterSpacing: 0.5, color: colors.textMuted },
  specRow: { flexDirection: 'row', gap: 6 },
  specCell: { flex: 1, minWidth: 0 },
  specLabel: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 15, color: colors.textMuted },
  specValue: { ...typography.mono, fontSize: 14, lineHeight: 19, color: colors.text },
  specHint: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 15, color: colors.textMuted },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 6,
  },
  composition: { ...typography.mono, fontSize: 13, lineHeight: 18, color: colors.text, flexShrink: 1 },
  commercial: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 },
  commercialText: { ...typography.mono, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  certRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  certBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: radius.sm,
    backgroundColor: colors.successSoft,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  certText: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 15, color: colors.success },
});
