import React from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { fetchFavoriteProducts } from '../../api/client';
import { useSession } from '../../context/SessionContext';
import { useFocusLoad } from '../../features/useFocusLoad';
import { ProductRow } from '../../components/ProductRow';
import { SectionHeader } from '../../components/SectionHeader';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { colors, spacing } from '../../theme';

type Props = RootStackScreenProps<'FavoriteProducts'>;

// Orijinal tasarımdaki "Favori Ürünler". Ürün sayfasındaki yıldızla eklenir;
// ekrana her dönüşte yenilenir (ürün sayfasında yıldız kaldırılmış olabilir).
export function FavoriteProductsScreen({ navigation }: Props) {
  const { user } = useSession();
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchFavoriteProducts().then(({ products }) => products)
  );

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
        <ErrorState error={error} fallback="Favoriler alınamadı" onRetry={reload} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={refreshControl(refreshing, refresh)}
        ListHeaderComponent={data.length ? <SectionHeader title="Favori kumaşlar" count={data.length} first /> : null}
        ListEmptyComponent={
          <EmptyState
            icon="star-outline"
            title="Henüz favori yok"
            message="Ürün sayfasındaki yıldıza dokunarak beğendiğiniz kumaşları burada toplayabilirsiniz."
            actionLabel="Ürünlere göz at"
            onAction={() => navigation.navigate('MainTabs', { screen: 'ProductList' })}
          />
        }
        renderItem={({ item, index }) => (
          <ProductRow
            product={item}
            divider={index < data.length - 1}
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
});
