import React from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import { ProductThumbnail } from './ProductThumbnail';
import { StockValue } from './StockIndicator';
import { formatMeasure } from '../features/calculators/parse';
import type { Product, ProductType } from '../types';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../theme';

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  raschel: 'Raschel',
  orme: 'Örme',
  dokuma: 'Dokuma',
  diger: 'Diğer',
};

// Ürün listesi satırı (taslak: docs/tasarim-yonleri/CUrunler.dc.html, CFirma.dc.html).
// Kutu yerine beyaz blok içinde çizgiyle ayrılan satır; kod ve ölçüler eşit
// aralıklı yazıyla, stok yeşil/turuncu noktayla. Ürünler ve Firma sayfası ortak kullanır.
export function ProductRow({
  product,
  showCompany = true,
  onPress,
  onRequestSample,
  divider = true,
}: {
  product: Product;
  // Firma sayfasında firma adı zaten başlıkta; tekrar yazılmaz.
  showCompany?: boolean;
  onPress: () => void;
  // Verilmezse "Talep Et" gösterilmez (kendi ürünü, giriş yapılmamış).
  onRequestSample?: () => void;
  divider?: boolean;
}) {
  const typeLabel = PRODUCT_TYPE_LABELS[product.type] ?? product.type;
  return (
    <Pressable
      onPress={onPress}
      // Web'de "button" rolü gerçek <button> üretir; içindeki "Talep Et" de
      // düğme olduğu için geçersiz iç içe <button> oluşuyordu (React uyarısı,
      // tarayıcıda tıklama karışabilir). Web'de satır rolsüz, telefonda ekran
      // okuyucu için düğme.
      accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
      accessibilityLabel={`${product.code}, ${typeLabel}, ${product.content}`}
      android_ripple={{ color: colors.pressed }}
      style={({ pressed }) => [styles.row, divider && styles.divider, pressed && styles.pressed]}
    >
      <ProductThumbnail productId={product.id} hasImage={product.hasImage} size={64} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.code} numberOfLines={1}>
            {product.code}
          </Text>
          <View style={styles.typeTag}>
            <Text style={styles.typeTagText}>{typeLabel}</Text>
          </View>
        </View>
        {showCompany && product.company ? (
          <Text style={styles.company} numberOfLines={1}>
            {product.company.name}
          </Text>
        ) : null}
        <Text style={styles.content} numberOfLines={1}>
          {product.content} · {product.useArea}
        </Text>
        <View style={styles.bottomRow}>
          <View style={styles.measures}>
            <Text style={styles.measureText}>
              {formatMeasure(product.weightGsm)} gr/m² · {formatMeasure(product.widthCm)} cm ·{' '}
            </Text>
            <StockValue stock={product.stock} />
          </View>
          {onRequestSample ? (
            <Pressable
              onPress={onRequestSample}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`${product.code} için numune talep et`}
              style={({ pressed }) => [styles.requestAction, pressed && styles.requestPressed]}
            >
              <Text style={styles.requestText}>Talep Et</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.gutter,
    backgroundColor: colors.surface,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  pressed: { backgroundColor: colors.pressed },
  body: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  code: { ...typography.monoStrong, color: colors.primary, flexShrink: 1 },
  typeTag: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  typeTagText: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.textMuted },
  company: { ...typography.label, color: colors.accent },
  content: { ...typography.label, fontFamily: fonts.regular, color: colors.text },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH,
  },
  measures: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', flexShrink: 1 },
  measureText: { ...typography.mono, fontSize: 14, lineHeight: 19, color: colors.textMuted },
  requestAction: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    marginRight: -spacing.sm,
    borderRadius: radius.sm,
  },
  requestPressed: { backgroundColor: colors.pressed },
  requestText: { ...typography.label, fontFamily: fonts.semibold, color: colors.primary },
});
