import React from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProductThumbnail } from './ProductThumbnail';
import { StockValue } from './StockIndicator';
import { formatMeasure } from '../features/calculators/parse';
import { TYPE_LABELS, categoryLabel, usageLabel } from '../features/products/catalog';
import type { Product } from '../types';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../theme';

// Eski adıyla kullanan ekranlar için (etiketlerin kaynağı artık katalog).
export const PRODUCT_TYPE_LABELS = TYPE_LABELS;

// Satırda en fazla bu kadar kullanım amacı yazılır, fazlası "+N".
const MAX_ROW_USAGES = 2;

function usageSummary(product: Product) {
  if (!product.usages?.length) return product.useArea;
  const shown = product.usages.slice(0, MAX_ROW_USAGES).map(usageLabel).join(', ');
  const rest = product.usages.length - MAX_ROW_USAGES;
  return rest > 0 ? `${shown} +${rest}` : shown;
}

// Ürün listesi satırı (taslak: docs/tasarim-yonleri/CUrunler.dc.html, CFirma.dc.html).
// Kutu yerine beyaz blok içinde çizgiyle ayrılan satır; kod ve ölçüler eşit
// aralıklı yazıyla, stok yeşil/turuncu noktayla. Ürünler, Firma sayfası,
// Favorilerim ve Son Baktıklarım ortak kullanır.
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
  const category = categoryLabel(product.type, product.subtype ?? '');
  const usage = usageSummary(product);
  return (
    <Pressable
      onPress={onPress}
      // Web'de "button" rolü gerçek <button> üretir; içindeki "Talep Et" de
      // düğme olduğu için geçersiz iç içe <button> oluşuyordu (React uyarısı,
      // tarayıcıda tıklama karışabilir). Web'de satır rolsüz, telefonda ekran
      // okuyucu için düğme.
      accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
      accessibilityLabel={`${product.code}, ${category}, ${product.content}${product.isFavorite ? ', favorilerde' : ''}`}
      android_ripple={{ color: colors.pressed }}
      style={({ pressed }) => [styles.row, divider && styles.divider, pressed && styles.pressed]}
    >
      <ProductThumbnail productId={product.id} hasImage={product.hasImage} size={64} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          {product.isFavorite ? <Ionicons name="star" size={14} color={colors.warningDot} /> : null}
          <Text style={styles.code} numberOfLines={1}>
            {product.code}
          </Text>
          <View style={styles.typeTag}>
            <Text style={styles.typeTagText} numberOfLines={1}>
              {category}
            </Text>
          </View>
        </View>
        {showCompany && product.company ? (
          <Text style={styles.company} numberOfLines={1}>
            {product.company.name}
          </Text>
        ) : null}
        <Text style={styles.content} numberOfLines={1}>
          {usage ? `${product.content} · ${usage}` : product.content}
        </Text>
        <View style={styles.bottomRow}>
          <View style={styles.measures}>
            <Text style={styles.measureText}>
              {formatMeasure(product.weightGsm)} gr/m² · {formatMeasure(product.widthCm)} cm ·{' '}
            </Text>
            <StockValue stock={product.stock} unit={product.stockUnit} />
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  code: { ...typography.monoStrong, color: colors.primary, flexShrink: 0 },
  typeTag: {
    flexShrink: 1,
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
