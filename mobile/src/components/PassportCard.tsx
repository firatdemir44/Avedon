import React from 'react';
import { View, Text, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { StockDot, formatStock } from './StockIndicator';
import { formatMeasure } from '../features/calculators/parse';
import { STOCK_UNIT_LABELS, isYarnType, subtypeLabel, typeLabel, type StockUnit } from '../features/products/catalog';
import {
  certificateLabel,
  effectiveWidthCm,
  formatComposition,
  widthHintLabel,
} from '../features/products/glossaryLabels';
import type { CompositionItem } from '../types';
import { useTheme } from '../theme/ThemeContext';
import { Badge } from '../ui';

// Kumaş pasaportu kartı (Faz 1, Adım 6; taslak docs/tasarim-2027/Main.dc.html).
// Akış kartında ürünün özeti: ui/Card ölçülerinde kutu (surface-1, 1px line,
// radius-lg), içinde kesik çizgili iç çerçeve; ölçüler mono-14.
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
  // İplikte özet satırı ("30/1 Ne Penye Kompakt Pamuk"); kumaşta boş.
  yarnSummary: string;
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
  // Akış ürünü yarnSummary, katalog/detay ürünü yarn.summary taşır.
  yarnSummary?: string | null;
  yarn?: { summary: string } | null;
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
    yarnSummary: product.yarnSummary ?? product.yarn?.summary ?? '',
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
  // İplikte ölçüler okunmaz (gramaj/en 0).
  if (isYarnType(product.type)) {
    const blend = product.composition.length ? `, ${formatComposition(product.composition)}` : '';
    return `İplik. ${product.code}${product.yarnSummary ? `, ${product.yarnSummary}` : ''}${blend}, ${commercialSummary(product)}`;
  }
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
  const t = useTheme();
  const structure = subtypeLabel(product.type, product.subtype) || typeLabel(product.type);
  // "tüp, tek yüz" / "tüp, açık en" / "tüp en" / "açık en"
  const widthHint = widthHintLabel(product.widthType, product.widthMeaning);
  const composition = product.composition.length ? formatComposition(product.composition) : '';
  const certificates = product.certificateNames ?? [];
  // İplikte (Faz 2, Adım 6) gramaj/en 0'dır: üç sütunlu ölçü satırı hiç
  // çizilmez, kart kod + karışım + stok satırından ibaret kalır.
  const isYarn = isYarnType(product.type);

  const frame: ViewStyle = {
    borderWidth: 1,
    borderColor: t.colors.line,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surface1,
    padding: t.space[1],
  };
  const specLabel = [t.type.caption12, { color: t.colors.ink3 }];
  const specValue = [t.type.mono14, { color: t.colors.ink }];

  const inner = (
    <View
      style={{
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: t.colors.lineStrong,
        borderRadius: t.radius.md,
        paddingVertical: t.space[2],
        paddingHorizontal: t.space[3],
        gap: t.space[2],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space[2] }}>
        <Text style={[t.type.body16Strong, { color: t.colors.brand, flexShrink: 1 }]} numberOfLines={1}>
          {product.code}
        </Text>
        <Text style={[t.type.caption12, { color: t.colors.ink3 }]} numberOfLines={1}>
          {isYarn ? 'İPLİK' : 'KUMAŞ PASAPORTU'}
        </Text>
      </View>

      {isYarn && product.yarnSummary ? (
        <Text style={specValue} numberOfLines={2}>
          {product.yarnSummary}
        </Text>
      ) : null}

      {isYarn ? null : (
        <View style={{ flexDirection: 'row', gap: t.space[2] }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={specLabel}>Gramaj</Text>
            <Text style={specValue} numberOfLines={1}>
              {formatMeasure(product.weightGsm)} g/m²
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={specLabel}>En</Text>
            <Text style={specValue} numberOfLines={1}>
              {formatMeasure(product.widthCm)} cm
            </Text>
            {widthHint ? (
              <Text style={specLabel} numberOfLines={1}>
                {widthHint}
              </Text>
            ) : null}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={specLabel}>{structureLabel(product.type)}</Text>
            <Text style={specValue} numberOfLines={1}>
              {structure}
            </Text>
          </View>
        </View>
      )}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: t.space[2],
          borderTopWidth: 1,
          borderTopColor: t.colors.line,
          paddingTop: t.space[2],
        }}
      >
        <Text style={[t.type.mono14, { color: t.colors.ink, flexShrink: 1 }]} numberOfLines={1}>
          {composition}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[1], flexShrink: 0 }}>
          <StockDot stock={product.stock} unit={product.stockUnit} />
          <Text style={[t.type.mono14, { color: t.colors.ink2 }]} numberOfLines={1}>
            {commercialSummary(product)}
          </Text>
        </View>
      </View>

      {certificates.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[1] }}>
          {certificates.map((name) => (
            <Badge key={name} kind="verified" label={certificateLabel(name)} />
          ))}
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return <View style={[frame, style]}>{inner}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${passportAccessibilityLabel(product)}. Ürün sayfasını aç`}
      style={({ pressed }) => [frame, pressed && { backgroundColor: t.colors.surface2 }, style]}
    >
      {inner}
    </Pressable>
  );
}
