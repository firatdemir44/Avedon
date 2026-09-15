import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import { fetchProduct } from '../../api/client';
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
import { getCachedProductImage, loadProductImage } from '../../features/products/productImageCache';
import { ImageViewerModal } from '../../components/ImageViewerModal';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { PrimaryButton } from '../../components/PrimaryButton';
import { StockBadge } from '../../components/StockIndicator';
import { PRODUCT_TYPE_LABELS } from '../../components/ProductRow';
import { formatMeasure } from '../../features/calculators/parse';
import { colors, fonts, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'ProductDetail'>;

// Taslak: docs/tasarim-yonleri/CUrun.dc.html. Fotoğraf + kod bloğu, çizgili
// özellik satırları, firma satırı; eylemler ekranın altına sabit çubukta.
export function ProductDetailScreen({ route, navigation }: Props) {
  const { productId } = route.params;
  const { user } = useSession();
  const insets = useSafeAreaInsets();
  // Düzenleme ekranından dönünce güncel veri görünsün diye odakta yenileniyor
  // (ilk yüklemeden sonra sessizce).
  const { data: product, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchProduct(productId).then(({ product: fetched }) => fetched)
  );
  const [imageUrl, setImageUrl] = useState<string | null>(
    () => getCachedProductImage(productId) ?? null
  );
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    if (!product?.hasImage || imageUrl) return;
    let cancelled = false;
    loadProductImage(productId)
      .then((url) => {
        if (!cancelled) setImageUrl(url);
      })
      .catch(() => {
        // Fotoğraf gelmezse sayfanın geri kalanı çalışmaya devam etsin.
      });
    return () => {
      cancelled = true;
    };
  }, [productId, product?.hasImage, imageUrl]);

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
  const typeLabel = PRODUCT_TYPE_LABELS[product.type] ?? product.type;
  const company = product.company;
  const openCompany = () => navigation.navigate('CompanyProfile', { companyId: product.companyId });

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl(refreshing, refresh)}>
        <View style={[styles.block, styles.heroBlock]}>
          {imageUrl ? (
            <Pressable
              onPress={() => setViewerOpen(true)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`${product.code} fotoğrafı`}
              accessibilityHint="Tam ekran büyütür"
              style={({ pressed }) => pressed && styles.heroPressed}
            >
              <Image source={{ uri: imageUrl }} style={styles.hero} resizeMode="cover" />
            </Pressable>
          ) : (
            <View style={[styles.hero, styles.heroPlaceholder]}>
              <Ionicons name="image-outline" size={28} color={colors.chevron} />
              <Text style={styles.heroPlaceholderText}>
                {product.hasImage ? 'Fotoğraf yükleniyor' : 'Bu ürünün fotoğrafı yok'}
              </Text>
            </View>
          )}
          <View style={styles.titleRow}>
            <View style={styles.titleTexts}>
              <Text style={styles.code}>{product.code}</Text>
              <Text style={styles.titleMeta}>
                {typeLabel} · {product.useArea}
              </Text>
            </View>
            <StockBadge stock={product.stock} />
          </View>
        </View>

        <View style={[styles.block, styles.specBlock]}>
          <SpecRow label="Stok" value={`${formatMeasure(product.stock)} m`} />
          <SpecRow label="Ağırlık" value={`${formatMeasure(product.weightGsm)} gr/m²`} />
          <SpecRow label="Genişlik" value={`${formatMeasure(product.widthCm)} cm`} />
          <SpecRow label="İçerik" value={product.content} />
          <SpecRow label="Tip" value={typeLabel} last />
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

      <ImageViewerModal imageUrl={imageUrl} visible={viewerOpen} onClose={() => setViewerOpen(false)} />
    </View>
  );
}

function SpecRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.specRow, !last && styles.specDivider]}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.md, gap: spacing.blockGap },
  block: { backgroundColor: colors.surface },
  heroBlock: { paddingHorizontal: spacing.gutter, paddingTop: 12, paddingBottom: spacing.gutter, gap: 12 },
  hero: { width: '100%', height: 219, borderRadius: radius.md, backgroundColor: colors.surfaceTonal },
  heroPressed: { opacity: 0.9 },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  heroPlaceholderText: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  titleTexts: { flex: 1, gap: 2 },
  code: { fontFamily: fonts.monoSemibold, fontSize: 22, lineHeight: 28, color: colors.primary },
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
  specValue: { ...typography.mono, fontFamily: fonts.monoMedium, fontSize: 14, color: colors.text, flexShrink: 1, textAlign: 'right' },
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
