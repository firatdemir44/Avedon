import React, { useMemo, useState } from 'react';
import { View, SectionList, StyleSheet } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { clearRecentlyViewedProducts, fetchRecentlyViewedProducts, type RecentlyViewedProduct } from '../../api/client';
import { useSession } from '../../context/SessionContext';
import { useFocusLoad } from '../../features/useFocusLoad';
import { formatDayLabel } from '../../features/time';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { ProductRow } from '../../components/ProductRow';
import { ListRow } from '../../components/ListRow';
import { SectionHeader } from '../../components/SectionHeader';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { colors, spacing } from '../../theme';

type Props = RootStackScreenProps<'RecentlyViewedProducts'>;

// Orijinal tasarımdaki "Son Bakılan Ürünler" (Avedon Geçmişi): güne göre
// gruplu, en son bakılan üstte. Kayıt sunucuda (her cihazda aynı); kendi
// firmanın ürünleri tutulmuyor.
export function RecentlyViewedProductsScreen({ navigation }: Props) {
  const { user } = useSession();
  const { data, setData, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchRecentlyViewedProducts().then(({ products }) => products)
  );
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState(false);

  const sections = useMemo(() => {
    const groups: { title: string; data: RecentlyViewedProduct[] }[] = [];
    for (const product of data ?? []) {
      const title = formatDayLabel(product.viewedAt);
      const last = groups[groups.length - 1];
      if (last && last.title === title) last.data.push(product);
      else groups.push({ title, data: [product] });
    }
    return groups;
  }, [data]);

  const clearHistory = async () => {
    const confirmed = await confirmAction({
      title: 'Geçmişi temizle',
      message: 'Son baktığınız ürünlerin listesi silinsin mi?',
      confirmLabel: 'Temizle',
      destructive: true,
    });
    if (!confirmed) return;
    setClearing(true);
    setClearError(false);
    try {
      await clearRecentlyViewedProducts();
      haptics.success();
      setData([]);
    } catch {
      haptics.error();
      setClearError(true);
    } finally {
      setClearing(false);
    }
  };

  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        <SkeletonList variant="product" />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.screen}>
        <ErrorState error={error} fallback="Son baktıklarınız alınamadı" onRetry={reload} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={refreshControl(refreshing, refresh)}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <SectionHeader title={section.title} count={section.data.length} first={section === sections[0]} />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="time-outline"
            title="Henüz baktığınız ürün yok"
            message="Açtığınız ürünler burada gün gün listelenir. Kendi firmanızın ürünleri eklenmez."
            actionLabel="Ürünlere göz at"
            onAction={() => navigation.navigate('MainTabs', { screen: 'ProductList' })}
          />
        }
        ListFooterComponent={
          data.length > 0 ? (
            <View style={styles.footer}>
              {clearError ? (
                <InlineError message="Geçmiş temizlenemedi" onRetry={clearHistory} style={styles.banner} />
              ) : null}
              <View style={styles.block}>
                <ListRow
                  title={clearing ? 'Temizleniyor...' : 'Geçmişi temizle'}
                  tone="danger"
                  chevron={false}
                  divider={false}
                  onPress={clearing ? undefined : clearHistory}
                />
              </View>
            </View>
          ) : null
        }
        renderItem={({ item, index, section }) => (
          <ProductRow
            product={item}
            divider={index < section.data.length - 1}
            onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
            onRequestSample={
              user && user.companyId !== item.companyId
                ? () => navigation.navigate('SampleRequestForm', { productId: item.id, productCode: item.code })
                : undefined
            }
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingBottom: spacing.xl },
  footer: { marginTop: spacing.lg, gap: spacing.sm },
  block: { backgroundColor: colors.surface },
  banner: { marginHorizontal: spacing.gutter },
});
