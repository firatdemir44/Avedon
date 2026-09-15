import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TextInput, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { MainTabScreenProps } from '../../navigation/types';
import { fetchProducts, searchCompanies } from '../../api/client';
import { mockProducts } from '../../data/mockProducts';
import { useSession } from '../../context/SessionContext';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { ProductRow, PRODUCT_TYPE_LABELS } from '../../components/ProductRow';
import { ListRow } from '../../components/ListRow';
import { SectionHeader } from '../../components/SectionHeader';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { PrimaryButton } from '../../components/PrimaryButton';
import type { Company, Product } from '../../types';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

type Props = MainTabScreenProps<'ProductList'>;

// Taslak: docs/tasarim-yonleri/CUrunler.dc.html. Üstte beyaz arama çubuğu
// (yanında "Firmam"), altta gri aralıktan sonra çizgiyle ayrılan ürün satırları.
export function ProductListScreen({ navigation }: Props) {
  const { user } = useSession();
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const queryRef = useRef(query);
  queryRef.current = query;

  // pull: aşağı çekip yenileme — liste yerinde kalır, üstte gösterge döner.
  const loadProducts = useCallback((search: string, signal: { cancelled: boolean }, pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    fetchProducts(search)
      .then(({ products: fetched }) => {
        if (signal.cancelled) return;
        setProducts(fetched);
        setOffline(false);
      })
      .catch(() => {
        if (signal.cancelled) return;
        // API'ye ulaşılamıyorsa geliştirme kolaylığı için mock veriye düş
        const q = search.trim().toLowerCase();
        setProducts(
          q
            ? mockProducts.filter((p) =>
                [p.code, p.content, p.useArea, PRODUCT_TYPE_LABELS[p.type]].join(' ').toLowerCase().includes(q)
              )
            : mockProducts
        );
        setOffline(true);
      })
      .finally(() => {
        if (signal.cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });

    if (search.trim()) {
      searchCompanies(search)
        .then(({ companies: fetched }) => {
          if (!signal.cancelled) setCompanies(fetched);
        })
        .catch(() => {
          if (!signal.cancelled) setCompanies([]);
        });
    } else {
      setCompanies([]);
    }
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    const timer = setTimeout(() => loadProducts(query, signal), 300);
    return () => {
      signal.cancelled = true;
      clearTimeout(timer);
    };
  }, [query, loadProducts]);

  useFocusEffect(
    useCallback(() => {
      const signal = { cancelled: false };
      loadProducts(queryRef.current, signal);
      return () => {
        signal.cancelled = true;
      };
    }, [loadProducts])
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <View style={styles.searchField}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="İçerik, gramaj, kullanım alanı ara"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Ürün ve firma ara"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Aramayı temizle">
              <Ionicons name="close-circle" size={18} color={colors.chevron} />
            </Pressable>
          ) : null}
        </View>
        {/* Hesaplama araçları Hesaplamalar sekmesinde; burada yalnızca katalogla
            doğrudan ilgili kısayol kalıyor. */}
        {user?.companyId ? (
          <PrimaryButton
            label="Firmam"
            variant="outline"
            onPress={() => navigation.navigate('CompanyProfile')}
            style={styles.myCompany}
          />
        ) : null}
      </View>
      {offline ? <Text style={styles.offlineNotice}>Sunucuya ulaşılamadı, örnek veriler gösteriliyor.</Text> : null}
      {loading && products.length === 0 ? (
        <SkeletonList variant="product" />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl(refreshing, () =>
            loadProducts(queryRef.current, { cancelled: false }, true)
          )}
          ListHeaderComponent={
            companies.length > 0 ? (
              <View>
                <SectionHeader title="Firmalar" first />
                <View style={styles.block}>
                  {companies.map((c, index) => (
                    <ListRow
                      key={c.id}
                      title={c.name}
                      left={<CompanyAvatar name={c.name} verification={c.verification} size={36} />}
                      divider={index < companies.length - 1}
                      onPress={() => navigation.navigate('CompanyProfile', { companyId: c.id })}
                    />
                  ))}
                </View>
                <SectionHeader title="Ürünler" count={products.length} />
              </View>
            ) : (
              <View style={styles.blockGap} />
            )
          }
          ListEmptyComponent={
            query.trim() ? (
              <EmptyState
                icon="search-outline"
                title="Sonuç bulunamadı"
                message={
                  companies.length > 0
                    ? `"${query.trim()}" ile eşleşen ürün yok; yukarıdaki firmalara göz atabilirsiniz.`
                    : `"${query.trim()}" ile eşleşen ürün ya da firma yok. İçerik, gramaj veya kullanım alanıyla deneyin.`
                }
                actionLabel="Aramayı temizle"
                onAction={() => setQuery('')}
              />
            ) : (
              <EmptyState
                icon="cube-outline"
                title="Henüz ürün yok"
                message="Üreticiler ürün ekledikçe katalog burada dolacak."
              />
            )
          }
          renderItem={({ item, index }) => (
            <ProductRow
              product={item}
              divider={index < products.length - 1}
              onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
              onRequestSample={
                user
                  ? () => navigation.navigate('SampleRequestForm', { productId: item.id, productCode: item.code })
                  : undefined
              }
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTonal,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
    paddingVertical: 0,
    minHeight: MIN_TOUCH - 2,
  },
  myCompany: { paddingHorizontal: spacing.gutter },
  offlineNotice: {
    ...typography.caption,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: spacing.gutter,
    paddingVertical: 6,
  },
  listContent: { paddingBottom: spacing.xl },
  blockGap: { height: spacing.blockGap },
  block: { backgroundColor: colors.surface },
});
