import React from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import { fetchFavoriteProducts } from '../../api/client';
import { useSession } from '../../context/SessionContext';
import { useFocusLoad } from '../../features/useFocusLoad';
import { ProductRow } from '../../components/ProductRow';
import { SectionHeader } from '../../components/SectionHeader';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { RfqSelectionBar } from '../../components/RfqSelectionBar';
import { useRfqSelection } from '../../features/quotes/rfqSelection';
import { haptics } from '../../features/haptics';
import { toSelectionItem } from './ProductListScreen';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'FavoriteProducts'>;

// "Takip Ettiklerim" (Faz 1 Adım 6'ya kadar "Favorilerim"; kayıt yine
// ProductFavorite, yalnızca etiket değişti). Ürün sayfasındaki ya da akış
// kartındaki "Takibe al" ile eklenir; ekrana her dönüşte yenilenir.
// Faz 3, Adım 1: ürün listesindeki "Teklif için seç" kipi burada da var —
// takip edilenler zaten karşılaştırılacak kısa listedir.
export function FavoriteProductsScreen({ navigation }: Props) {
  const { user } = useSession();
  const selection = useRfqSelection();
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
      {user && data.length > 1 ? (
        <View style={styles.modeBar}>
          <Pressable
            onPress={() => {
              haptics.selection();
              if (selection.active) selection.cancel();
              else selection.start();
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: selection.active }}
            accessibilityLabel={
              selection.active ? 'Teklif için seçmeyi bırak' : 'Teklif için ürün seç, birkaç firmaya birden sor'
            }
            style={({ pressed }) => [styles.modeButton, selection.active && styles.modeActive, pressed && styles.pressed]}
          >
            <Ionicons
              name={selection.active ? 'close' : 'checkbox-outline'}
              size={18}
              color={selection.active ? colors.primaryText : colors.primary}
            />
            <Text style={[styles.modeText, selection.active && styles.modeTextActive]}>
              {selection.active ? 'Seçimi bırak' : 'Teklif için seç'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={refreshControl(refreshing, refresh)}
        ListHeaderComponent={
          data.length ? <SectionHeader title="Takip edilen kumaşlar" count={data.length} first /> : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="bookmark-outline"
            title="Henüz takip ettiğiniz kumaş yok"
            message="Ürün sayfasındaki ya da akış kartındaki Takibe al düğmesiyle ilgilendiğiniz kumaşları burada toplayabilirsiniz."
            actionLabel="Ürünlere göz at"
            onAction={() => navigation.navigate('MainTabs', { screen: 'ProductList' })}
          />
        }
        renderItem={({ item, index }) => {
          const selectable = selection.active && !!user && user.companyId !== item.companyId;
          return (
            <ProductRow
              product={item}
              divider={index < data.length - 1}
              selectable={selectable}
              selected={selection.selectedIds.has(item.id)}
              onPress={() => {
                if (!selectable) {
                  navigation.navigate('ProductDetail', { productId: item.id });
                  return;
                }
                haptics.selection();
                selection.toggle(toSelectionItem(item));
              }}
              onRequestSample={
                user && user.companyId !== item.companyId
                  ? () => navigation.navigate('SampleRequestForm', { productId: item.id, productCode: item.code })
                  : undefined
              }
            />
          );
        }}
      />

      {selection.active ? (
        <RfqSelectionBar
          selection={selection}
          onSubmit={() => navigation.navigate('RfqForm', { items: selection.items })}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingBottom: spacing.xl },
  modeBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: MIN_TOUCH,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  modeActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { backgroundColor: colors.pressed },
  modeText: { ...typography.label, fontFamily: fonts.semibold, color: colors.primary },
  modeTextActive: { color: colors.primaryText },
});
