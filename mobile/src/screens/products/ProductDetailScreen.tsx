import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import { fetchProduct, setProductFavorite } from '../../api/client';
import { useFocusLoad } from '../../features/useFocusLoad';
import { SkeletonDetail } from '../../components/Skeleton';
import {
  EmptyState,
  ErrorState,
  InlineError,
  friendlyMessage,
  isNotFound,
} from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { ImageViewerModal } from '../../components/ImageViewerModal';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProductGallery } from '../../components/ProductGallery';
import { StockBadge, formatStock } from '../../components/StockIndicator';
import { categoryLabel, subtypeLabel, typeLabel, usageLabel } from '../../features/products/catalog';
import { formatMeasure } from '../../features/calculators/parse';
import { haptics } from '../../features/haptics';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'ProductDetail'>;

// Taslak: docs/tasarim-yonleri/CUrun.dc.html + orijinal tasarım "Ürün Sayfası"
// (kaydırmalı galeri, favori yıldızı). Galeri + kod bloğu, çizgili özellik
// satırları, firma satırı; eylemler ekranın altına sabit çubukta.
export function ProductDetailScreen({ route, navigation }: Props) {
  const { productId } = route.params;
  const { user } = useSession();
  const insets = useSafeAreaInsets();
  // Düzenleme ekranından dönünce güncel veri görünsün diye odakta yenileniyor
  // (ilk yüklemeden sonra sessizce).
  const { data: product, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchProduct(productId).then(({ product: fetched }) => fetched)
  );
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);

  useEffect(() => {
    if (product) setFavorite(!!product.isFavorite);
  }, [product]);

  useEffect(() => {
    // Taslakta başlık ürün kodu, eşit aralıklı yazıyla.
    if (product) {
      navigation.setOptions({
        title: product.code,
        headerTitleStyle: { ...typography.heading, fontFamily: fonts.monoSemibold, color: colors.primaryText },
      });
    }
  }, [navigation, product]);

  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        <SkeletonDetail variant="product" />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
        {error && !isNotFound(error) ? (
          <ErrorState error={error} fallback="Ürün alınamadı" onRetry={reload} />
        ) : (
          <EmptyState icon="cube-outline" title="Ürün bulunamadı" message="Ürün kaldırılmış olabilir." />
        )}
      </View>
    );
  }

  const isOwnProduct = !!user?.companyId && user.companyId === product.companyId;
  const company = product.company;
  const openCompany = () => navigation.navigate('CompanyProfile', { companyId: product.companyId });
  const subtype = subtypeLabel(product.type, product.subtype ?? '');
  const usages = (product.usages ?? []).map(usageLabel).join(', ');

  // İyimser: yıldız hemen değişir, sunucu reddederse geri döner.
  const toggleFavorite = async () => {
    if (favoriteBusy) return;
    const next = !favorite;
    setFavorite(next);
    setFavoriteBusy(true);
    haptics.light();
    try {
      const result = await setProductFavorite(product.id, next);
      setFavorite(result.isFavorite);
    } catch {
      setFavorite(!next);
      haptics.error();
    } finally {
      setFavoriteBusy(false);
    }
  };

  const favoriteButton = isOwnProduct ? null : (
    <Pressable
      onPress={toggleFavorite}
      accessibilityRole="button"
      accessibilityState={{ selected: favorite }}
      accessibilityLabel={favorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
      hitSlop={4}
      style={({ pressed }) => [styles.favoriteButton, pressed && styles.favoritePressed]}
    >
      <Ionicons name={favorite ? 'star' : 'star-outline'} size={22} color={favorite ? colors.warningDot : colors.text} />
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl(refreshing, refresh)}>
        <View style={[styles.block, styles.heroBlock]}>
          <ProductGallery
            productId={product.id}
            imageCount={product.imageCount ?? (product.hasImage ? 1 : 0)}
            onOpenImage={setViewerUrl}
            overlay={favoriteButton}
          />
          <View style={styles.titleRow}>
            <View style={styles.titleTexts}>
              <Text style={styles.code}>{product.code}</Text>
              <Text style={styles.titleMeta}>{categoryLabel(product.type, product.subtype ?? '')}</Text>
            </View>
            <StockBadge stock={product.stock} unit={product.stockUnit} />
          </View>
        </View>

        <View style={[styles.block, styles.specBlock]}>
          <SpecRow label="Çeşit" value={typeLabel(product.type)} />
          {subtype ? <SpecRow label="Alt çeşit" value={subtype} /> : null}
          {usages ? <SpecRow label="Kullanım" value={usages} sans /> : null}
          <SpecRow label="Stok" value={formatStock(product.stock, product.stockUnit)} />
          <SpecRow label="Ağırlık" value={`${formatMeasure(product.weightGsm)} gr/m²`} />
          <SpecRow label="Genişlik" value={`${formatMeasure(product.widthCm)} cm`} />
          <SpecRow label="İçerik" value={product.content} last={!product.useArea} />
          {product.useArea ? <SpecRow label="Not" value={product.useArea} sans last /> : null}
        </View>

        {company ? (
          <Pressable
            onPress={openCompany}
            accessibilityRole="button"
            accessibilityLabel={`${company.name}, firma sayfasını aç`}
            android_ripple={{ color: colors.pressed }}
            style={({ pressed }) => [styles.block, styles.companyRow, pressed && styles.pressed]}
          >
            <CompanyAvatar
              name={company.name}
              verification={company.verification}
              size={36}
              companyId={company.id}
              logoUpdatedAt={company.logoUpdatedAt}
            />
            <View style={styles.companyTexts}>
              <Text style={styles.companyName} numberOfLines={1}>
                {company.name}
              </Text>
              <Text style={styles.companyMeta}>
                {company.verification === 'dogrulanmis' ? (
                  <Text style={styles.companyVerified}>Doğrulanmış üretici · </Text>
                ) : null}
                <Text style={styles.companyCount}>{product.companyProductCount} ürün</Text>
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.chevron} />
          </Pressable>
        ) : null}

        {error ? (
          <InlineError
            message={friendlyMessage(error, 'Ürün bilgisi yenilenemedi')}
            onRetry={reload}
            style={styles.banner}
          />
        ) : null}
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 10 }]}>
        <PrimaryButton label="Firma" variant="outline" size="lg" onPress={openCompany} />
        {isOwnProduct ? (
          <PrimaryButton
            label="Ürünü Düzenle"
            icon="create-outline"
            size="lg"
            onPress={() => navigation.navigate('AddProduct', { productId: product.id })}
            style={styles.actionMain}
          />
        ) : (
          <PrimaryButton
            label="Numune Talep Et"
            icon="cube-outline"
            size="lg"
            onPress={() =>
              navigation.navigate('SampleRequestForm', { productId: product.id, productCode: product.code })
            }
            style={styles.actionMain}
          />
        )}
      </View>

      <ImageViewerModal imageUrl={viewerUrl} visible={!!viewerUrl} onClose={() => setViewerUrl(null)} />
    </View>
  );
}

// sans: serbest metin (kullanım, not) eşit aralıklı yazıyla değil normal yazıyla.
function SpecRow({ label, value, last, sans }: { label: string; value: string; last?: boolean; sans?: boolean }) {
  return (
    <View style={[styles.specRow, !last && styles.specDivider]}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={[styles.specValue, sans && styles.specValueSans]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.md, gap: spacing.blockGap },
  block: { backgroundColor: colors.surface },
  heroBlock: { paddingHorizontal: spacing.gutter, paddingTop: 12, paddingBottom: spacing.gutter, gap: 12 },
  favoriteButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoritePressed: { backgroundColor: colors.pressed },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  titleTexts: { flex: 1, gap: 2 },
  code: { fontFamily: fonts.monoSemibold, fontSize: 24, lineHeight: 30, color: colors.primary },
  titleMeta: { ...typography.body, color: colors.textMuted },
  specBlock: { paddingHorizontal: spacing.gutter, paddingVertical: spacing.xs },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 40,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  specDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  specLabel: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  specValue: {
    ...typography.mono,
    fontFamily: fonts.monoMedium,
    fontSize: 16,
    color: colors.text,
    flexShrink: 1,
    textAlign: 'right',
  },
  specValueSans: { ...typography.body, color: colors.text },
  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.gutter,
    paddingVertical: 10,
  },
  pressed: { backgroundColor: colors.pressed },
  companyTexts: { flex: 1 },
  companyName: { ...typography.bodyStrong, color: colors.text },
  companyMeta: { ...typography.caption },
  companyVerified: { fontFamily: fonts.medium, color: colors.accent },
  companyCount: { color: colors.textMuted },
  banner: { marginHorizontal: spacing.gutter },
  actionBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.gutter,
    paddingTop: 10,
  },
  actionMain: { flex: 1 },
});
