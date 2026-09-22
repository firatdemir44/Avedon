import React from 'react';
import { View, Text, Pressable, Platform, type ViewStyle } from 'react-native';
import { ProductThumbnail } from './ProductThumbnail';
import { StockValue } from './StockIndicator';
import { formatMeasure } from '../features/calculators/parse';
import { TYPE_LABELS, categoryLabel, isYarnType, usageLabel } from '../features/products/catalog';
import { formatComposition } from '../features/products/glossaryLabels';
import type { Product } from '../types';
import { useTheme } from '../theme/ThemeContext';
import { Badge, Button, Icon } from '../ui';

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

// Ürün listesi satırı; ui/ProductCard diliyle (DESIGN.md §3 ürün kartı):
// sol 72px görsel, kod body-16-strong, çeşit mono-14, özellik satırı body-14,
// firma body-14 ink-3 + doğrulanmış rozeti. Ürünler, Firma sayfası,
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
  // Verilmezse "Numune talep et" gösterilmez (kendi ürünü, giriş yapılmamış).
  onRequestSample?: () => void;
  divider?: boolean;
  // Çoklu teklif seçim kipi (Faz 3, Adım 1): satırda onay kutusu çıkar,
  // satıra basmak detaya değil seçime gider, talep düğmesi gizlenir.
  selectable?: boolean;
  selected?: boolean;
}) {
  const t = useTheme();
  // İplikte (Faz 2, Adım 6) gramaj/en 0'dır: "0 g/m² · 0 cm" anlamsız olur.
  // Onun yerine ipliğin özeti (numara + eğirme + lif) ve kg stoğu yazılır.
  const isYarn = isYarnType(product.type);
  const category = categoryLabel(product.type, product.subtype ?? '');
  const usage = isYarn ? '' : usageSummary(product);
  const summary = isYarn ? product.yarn?.summary || product.content : contentSummary(product);
  const certificates = product.certificateNames ?? [];
  const specs = [
    isYarn ? '' : `${formatMeasure(product.weightGsm)} gr/m² · ${formatMeasure(product.widthCm)} cm`,
    summary,
    usage,
  ]
    .filter(Boolean)
    .join(' · ');
  const showAction = !!onRequestSample && !selectable;

  const rowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: t.space[3],
    paddingVertical: t.space[3],
    paddingHorizontal: t.space[4],
    borderBottomWidth: divider ? 1 : 0,
    borderBottomColor: t.colors.line,
    minWidth: 0,
  };

  return (
    <Pressable
      onPress={onPress}
      // Web'de "button" rolü gerçek <button> üretir; içindeki talep düğmesi de
      // düğme olduğu için geçersiz iç içe <button> oluşuyordu. Web'de satır
      // rolsüz, telefonda ekran okuyucu için düğme / onay kutusu.
      accessibilityRole={Platform.OS === 'web' ? undefined : selectable ? 'checkbox' : 'button'}
      accessibilityState={selectable ? { checked: selected } : undefined}
      accessibilityLabel={`${product.code}, ${category}, ${summary}${
        certificates.length ? `, ${certificates.length} sertifika` : ''
      }${product.isFavorite ? ', takip ediliyor' : ''}${selectable ? (selected ? ', seçili' : ', seçili değil') : ''}`}
      style={({ pressed }) => [
        rowStyle,
        {
          backgroundColor:
            selectable && selected ? t.colors.brandSoft : pressed ? t.colors.surface2 : t.colors.surface1,
        },
      ]}
    >
      {selectable ? (
        <View style={{ width: t.size.icon, paddingTop: t.space[6], alignItems: 'center' }}>
          <Icon
            name={selected ? 'checkbox-outline' : 'square-outline'}
            color={selected ? 'brand' : 'ink3'}
          />
        </View>
      ) : null}
      <ProductThumbnail productId={product.id} hasImage={product.hasImage} />
      <View style={{ flex: 1, minWidth: 0, gap: t.space[1] / 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[1], minWidth: 0 }}>
          {/* Takip işareti (eski yıldız): kayıt ProductFavorite, etiket "takip". */}
          {product.isFavorite ? <Icon name="bookmark-outline" size={t.size.iconXs} color="brand" /> : null}
          <Text numberOfLines={1} style={[t.type.body16Strong, { color: t.colors.ink, flexShrink: 1 }]}>
            {product.code}
          </Text>
        </View>
        <Text numberOfLines={1} style={[t.type.mono14, { color: t.colors.ink2 }]}>
          {category}
        </Text>
        {specs ? (
          <Text numberOfLines={2} style={[t.type.body14, { color: t.colors.ink2 }]}>
            {specs}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: t.space[2] }}>
          {showCompany && product.company ? (
            <Text numberOfLines={1} style={[t.type.body14, { color: t.colors.ink3, flexShrink: 1 }]}>
              {product.company.name}
            </Text>
          ) : null}
          {showCompany && product.company?.verification === 'dogrulanmis' ? <Badge kind="verified" /> : null}
          {certificates.length ? (
            <Badge kind="verified" label={certificateBadgeText(certificates)} />
          ) : null}
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: t.space[2],
            minHeight: showAction ? t.size.touchMin : undefined,
          }}
        >
          <StockValue stock={product.stock} unit={product.stockUnit} />
          {showAction ? (
            <Button
              kind="quiet"
              label="Talep et"
              icon="sample"
              onPress={onRequestSample}
              accessibilityLabel={`${product.code} için numune talep et`}
              style={{ marginRight: -t.space[4], minHeight: t.size.touchMin }}
            />
          ) : null}
        </View>
      </View>
      {!selectable ? (
        <View style={{ alignSelf: 'center' }}>
          <Icon name="chevron" color="ink3" />
        </View>
      ) : null}
    </Pressable>
  );
}
