import React from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProductThumbnail } from './ProductThumbnail';
import { StockValue } from './StockIndicator';
import { formatMeasure } from '../features/calculators/parse';
import { TYPE_LABELS, categoryLabel, isYarnType, usageLabel } from '../features/products/catalog';
import { formatComposition } from '../features/products/glossaryLabels';
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

// Kompozisyon satırları varsa onlardan üretilir (pasaportun asıl verisi),
// yoksa eski serbest içerik metni.
function contentSummary(product: Product) {
  const composition = product.composition ?? [];
  return composition.length ? formatComposition(composition) : product.content;
}

// Sertifika rozeti satırda yer kaplamasın diye kısa ad + fazlası sayı.
const CERTIFICATE_SHORT_LABELS: Record<string, string> = {
  oeko_tex_100: 'OEKO-TEX',
  oeko_tex_made_in_green: 'OEKO-TEX MiG',
  gots: 'GOTS',
  grs: 'GRS',
  rcs: 'RCS',
  ocs: 'OCS',
  bci: 'BCI',
  bluesign: 'bluesign',
  iso_9001: 'ISO 9001',
  iso_14001: 'ISO 14001',
  reach: 'REACH',
  zdhc: 'ZDHC',
  higg: 'Higg',
  diger: 'Sertifika',
};

function certificateBadgeText(names: string[]) {
  const first = CERTIFICATE_SHORT_LABELS[names[0]] ?? names[0];
  return names.length > 1 ? `${first} +${names.length - 1}` : first;
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
  selectable = false,
  selected = false,
}: {
  product: Product;
  // Firma sayfasında firma adı zaten başlıkta; tekrar yazılmaz.
  showCompany?: boolean;
  onPress: () => void;
  // Verilmezse "Talep Et" gösterilmez (kendi ürünü, giriş yapılmamış).
  onRequestSample?: () => void;
  divider?: boolean;
  // Çoklu teklif seçim kipi (Faz 3, Adım 1): satırda onay kutusu çıkar,
  // satıra basmak detaya değil seçime gider, "Talep Et" gizlenir.
  selectable?: boolean;
  selected?: boolean;
}) {
  // İplikte (Faz 2, Adım 6) gramaj/en 0'dır: "0 g/m² · 0 cm" anlamsız olur.
  // Onun yerine ipliğin özeti (numara + eğirme + lif) ve kg stoğu yazılır.
  const isYarn = isYarnType(product.type);
  const category = categoryLabel(product.type, product.subtype ?? '');
  const usage = isYarn ? '' : usageSummary(product);
  const summary = isYarn ? product.yarn?.summary || product.content : contentSummary(product);
  const certificates = product.certificateNames ?? [];
  return (
    <Pressable
      onPress={onPress}
      // Web'de "button" rolü gerçek <button> üretir; içindeki "Talep Et" de
      // düğme olduğu için geçersiz iç içe <button> oluşuyordu (React uyarısı,
      // tarayıcıda tıklama karışabilir). Web'de satır rolsüz, telefonda ekran
      // okuyucu için düğme.
      accessibilityRole={Platform.OS === 'web' ? undefined : selectable ? 'checkbox' : 'button'}
      accessibilityState={selectable ? { checked: selected } : undefined}
      accessibilityLabel={`${product.code}, ${category}, ${summary}${
        certificates.length ? `, ${certificates.length} sertifika` : ''
      }${product.isFavorite ? ', takip ediliyor' : ''}${selectable ? (selected ? ', seçili' : ', seçili değil') : ''}`}
      android_ripple={{ color: colors.pressed }}
      style={({ pressed }) => [
        styles.row,
        divider && styles.divider,
        pressed && styles.pressed,
        selectable && selected && styles.rowSelected,
      ]}
    >
      {selectable ? (
        <View style={styles.checkbox}>
          <Ionicons
            name={selected ? 'checkbox' : 'square-outline'}
            size={22}
            color={selected ? colors.primary : colors.borderStrong}
          />
        </View>
      ) : null}
      <ProductThumbnail productId={product.id} hasImage={product.hasImage} size={64} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          {/* Takip işareti (eski yıldız): kayıt ProductFavorite, etiket "takip". */}
          {product.isFavorite ? <Ionicons name="bookmark" size={14} color={colors.primary} /> : null}
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
        <View style={styles.contentRow}>
          <Text style={styles.content} numberOfLines={1}>
            {usage ? `${summary} · ${usage}` : summary}
          </Text>
          {certificates.length ? (
            <View style={styles.certBadge}>
              <Ionicons name="ribbon-outline" size={11} color={colors.success} />
              <Text style={styles.certBadgeText} numberOfLines={1}>
                {certificateBadgeText(certificates)}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.bottomRow}>
          <View style={styles.measures}>
            {isYarn ? null : (
              <Text style={styles.measureText}>
                {formatMeasure(product.weightGsm)} gr/m² · {formatMeasure(product.widthCm)} cm ·{' '}
              </Text>
            )}
            <StockValue stock={product.stock} unit={product.stockUnit} />
          </View>
          {onRequestSample && !selectable ? (
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
  rowSelected: { backgroundColor: colors.accentSoft },
  checkbox: { width: 24, paddingTop: 20, alignItems: 'center' },
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
  contentRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  content: { ...typography.label, fontFamily: fonts.regular, color: colors.text, flexShrink: 1 },
  certBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
    borderRadius: radius.sm,
    backgroundColor: colors.successSoft,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  certBadgeText: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 15, color: colors.success },
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
