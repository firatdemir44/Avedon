import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { RootStackScreenProps } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import { fetchProduct, type ProductDetail } from '../../api/client';
import { getCachedProductImage, loadProductImage } from '../../features/products/productImageCache';
import { ImageViewerModal } from '../../components/ImageViewerModal';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Badge } from '../../components/Badge';
import { colors, radius, shadow, spacing, typography } from '../../theme';
import type { ProductType } from '../../types';

type Props = RootStackScreenProps<'ProductDetail'>;

const TYPE_LABELS: Record<ProductType, string> = {
  raschel: 'Raschel',
  orme: 'Örme',
  dokuma: 'Dokuma',
  diger: 'Diğer',
};

export function ProductDetailScreen({ route, navigation }: Props) {
  const { productId } = route.params;
  const { user } = useSession();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(
    () => getCachedProductImage(productId) ?? null
  );
  const [viewerOpen, setViewerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Düzenleme ekranından dönünce güncel veri görünsün diye odakta yenileniyor.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchProduct(productId)
        .then(({ product: fetched }) => {
          if (!cancelled) setProduct(fetched);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Ürün alınamadı');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [productId])
  );

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
    if (product) navigation.setOptions({ title: product.code });
  }, [navigation, product]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Text style={styles.empty}>{error ?? 'Ürün bulunamadı.'}</Text>
      </SafeAreaView>
    );
  }

  const isOwnProduct = !!user?.companyId && user.companyId === product.companyId;

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Tasarımda sayfanın üstünde tam genişlik fotoğraf var; dokununca
            tam ekran açılıyor. */}
        {imageUrl ? (
          <Pressable onPress={() => setViewerOpen(true)}>
            <Image source={{ uri: imageUrl }} style={styles.hero} resizeMode="cover" />
            <Text style={styles.zoomHint}>Büyütmek için dokunun</Text>
          </Pressable>
        ) : (
          <View style={[styles.hero, styles.heroPlaceholder]}>
            <Text style={styles.heroPlaceholderText}>
              {product.hasImage ? 'Fotoğraf yükleniyor...' : 'Bu ürünün fotoğrafı yok'}
            </Text>
          </View>
        )}

        <View style={styles.titleRow}>
          <Text style={styles.code}>{product.code}</Text>
          <Badge label={TYPE_LABELS[product.type]} tone="outline" />
        </View>

        {product.company ? (
          <Pressable
            style={styles.companyCard}
            onPress={() => navigation.navigate('CompanyProfile', { companyId: product.companyId })}
          >
            <CompanyAvatar
              name={product.company.name}
              verification={product.company.verification}
              size={44}
              companyId={product.company.id}
              logoUpdatedAt={product.company.logoUpdatedAt}
            />
            <View style={styles.companyText}>
              <Text style={styles.companyName}>{product.company.name}</Text>
              <View style={styles.badgeRow}>
                {product.company.verification === 'dogrulanmis' ? (
                  <Badge label="Doğrulanmış Üretici" />
                ) : null}
                <Badge label={`Toplam ${product.companyProductCount} Ürün`} />
              </View>
            </View>
          </Pressable>
        ) : null}

        <View style={styles.specCard}>
          <Text style={styles.specTitle}>Özellikler</Text>
          <SpecRow label="Ürün Kodu" value={product.code} />
          <SpecRow label="Ürün Tipi" value={TYPE_LABELS[product.type]} />
          <SpecRow label="Stok" value={`${product.stock} m`} />
          <SpecRow label="Ağırlık" value={`${product.weightGsm} gr/m²`} />
          <SpecRow label="Genişlik" value={`${product.widthCm} cm`} />
          <SpecRow label="İçerik" value={product.content} />
          <SpecRow label="Kullanım Alanları" value={product.useArea} last />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {isOwnProduct ? (
          <PrimaryButton
            label="Ürünü Düzenle"
            onPress={() => navigation.navigate('AddProduct', { productId: product.id })}
            style={{ marginTop: spacing.lg }}
          />
        ) : user ? (
          <PrimaryButton
            label="Numune Talep Et"
            onPress={() =>
              navigation.navigate('SampleRequestForm', {
                productId: product.id,
                productCode: product.code,
              })
            }
            style={{ marginTop: spacing.lg }}
          />
        ) : null}

        <PrimaryButton
          label="Firma Sayfasını Aç"
          variant="secondary"
          onPress={() => navigation.navigate('CompanyProfile', { companyId: product.companyId })}
          style={{ marginTop: spacing.sm }}
        />
      </ScrollView>

      <ImageViewerModal
        imageUrl={imageUrl}
        visible={viewerOpen}
        onClose={() => setViewerOpen(false)}
      />
    </SafeAreaView>
  );
}

function SpecRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.specRow, last && styles.specRowLast]}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  // Tasarımdaki kalın mavi çerçeve yerine yumuşak köşe + tonlu zemin: çerçeveli
  // fotoğraf bugünkü arayüzlerde eskimiş duruyor.
  hero: {
    width: '100%',
    height: 260,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceTonal,
  },
  heroPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPlaceholderText: { ...typography.label, fontWeight: '400', color: colors.textMuted },
  zoomHint: {
    ...typography.caption,
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  code: { ...typography.title, color: colors.primary, flex: 1 },
  companyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    ...shadow.card,
  },
  companyText: { flex: 1, marginLeft: spacing.md },
  companyName: { ...typography.subtitle, fontWeight: '700', color: colors.text },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  specCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    ...shadow.card,
  },
  specTitle: { ...typography.heading, color: colors.primary, marginBottom: spacing.sm },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  specRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  specLabel: { ...typography.label, fontWeight: '400', color: colors.textMuted },
  specValue: { ...typography.label, color: colors.text, flexShrink: 1, textAlign: 'right' },
  error: { ...typography.label, fontWeight: '400', color: colors.danger, marginTop: spacing.md },
  empty: { ...typography.body, textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
});
