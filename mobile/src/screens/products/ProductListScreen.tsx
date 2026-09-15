import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { SearchField } from '../../components/SearchField';
import { haptics } from '../../features/haptics';
import type { Company, Product, ProductType } from '../../types';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

type Props = MainTabScreenProps<'ProductList'>;

// Kullanıcı isteği (2026-09-15): ürünler ya tek akışta ("Tümü") ya da kumaş
// çeşidine göre klasörlerde ("Çeşitler") görülebilsin; seçim hatırlanır.
type ViewMode = 'all' | 'groups';
const VIEW_MODE_KEY = 'avedon.productListViewMode';
const TYPE_ORDER: ProductType[] = ['raschel', 'orme', 'dokuma', 'diger'];

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
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [openType, setOpenType] = useState<ProductType | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    AsyncStorage.getItem(VIEW_MODE_KEY)
      .then((saved) => {
        if (saved === 'all' || saved === 'groups') setViewMode(saved);
      })
      .catch(() => {});
  }, []);

  const changeViewMode = (mode: ViewMode) => {
    if (mode === viewMode) return;
    haptics.selection();
    setViewMode(mode);
    setOpenType(null);
    AsyncStorage.setItem(VIEW_MODE_KEY, mode).catch(() => {});
  };

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

  const groups = useMemo(
    () =>
      TYPE_ORDER.map((type) => ({ type, count: products.filter((p) => p.type === type).length })).filter(
        (g) => g.count > 0
      ),
    [products]
  );

  // Klasör görünümünde, klasör açılmamışken ve arama yokken klasör listesi çizilir.
  const showFolders = viewMode === 'groups' && openType === null && !query.trim();
  const visibleProducts = viewMode === 'groups' && openType ? products.filter((p) => p.type === openType) : products;

  const refresh = refreshControl(refreshing, () => loadProducts(queryRef.current, { cancelled: false }, true));

  const viewToggle = (
    <View style={styles.toggleBar} accessibilityRole="tablist">
      {(
        [
          { mode: 'all', label: 'Tümü', icon: 'list-outline' },
          { mode: 'groups', label: 'Çeşitler', icon: 'folder-outline' },
        ] as const
      ).map((option) => {
        const selected = viewMode === option.mode;
        return (
          <Pressable
            key={option.mode}
            onPress={() => changeViewMode(option.mode)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.mode === 'all' ? 'Tüm ürünler tek listede' : 'Ürünler çeşide göre klasörlerde'}
            style={({ pressed }) => [styles.toggleOption, selected && styles.toggleSelected, pressed && !selected && styles.togglePressed]}
          >
            <Ionicons name={option.icon} size={18} color={selected ? colors.primaryText : colors.textMuted} />
            <Text style={[styles.toggleText, selected && styles.toggleTextSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const companiesHeader =
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
      </View>
    ) : null;

  const openFolderHeader =
    viewMode === 'groups' && openType ? (
      <Pressable
        onPress={() => {
          haptics.selection();
          setOpenType(null);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${PRODUCT_TYPE_LABELS[openType]} klasöründen çık, tüm çeşitlere dön`}
        style={({ pressed }) => [styles.folderBack, pressed && styles.rowPressed]}
      >
        <Ionicons name="chevron-back" size={20} color={colors.primary} />
        <Ionicons name="folder-open-outline" size={20} color={colors.primary} />
        <Text style={styles.folderBackTitle}>{PRODUCT_TYPE_LABELS[openType]}</Text>
        <Text style={styles.folderBackCount}>{visibleProducts.length} ürün</Text>
      </Pressable>
    ) : null;

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="İçerik, gramaj, kullanım alanı ara"
          accessibilityLabel="Ürün ve firma ara"
          style={styles.searchField}
        />
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
      {viewToggle}
      {offline ? <Text style={styles.offlineNotice}>Sunucuya ulaşılamadı, örnek veriler gösteriliyor.</Text> : null}
      {loading && products.length === 0 ? (
        <SkeletonList variant="product" />
      ) : showFolders ? (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.type}
          contentContainerStyle={styles.listContent}
          refreshControl={refresh}
          ListHeaderComponent={<SectionHeader title="Kumaş çeşitleri" count={groups.length} first />}
          ListEmptyComponent={
            <EmptyState icon="cube-outline" title="Henüz ürün yok" message="Üreticiler ürün ekledikçe katalog burada dolacak." />
          }
          renderItem={({ item, index }) => (
            <ListRow
              title={PRODUCT_TYPE_LABELS[item.type]}
              subtitle={`${item.count} ürün`}
              left={
                <View style={styles.folderIcon}>
                  <Ionicons name="folder" size={22} color={colors.primary} />
                </View>
              }
              divider={index < groups.length - 1}
              accessibilityLabel={`${PRODUCT_TYPE_LABELS[item.type]} klasörü, ${item.count} ürün`}
              onPress={() => {
                haptics.selection();
                setOpenType(item.type);
              }}
            />
          )}
        />
      ) : (
        <FlatList
          data={visibleProducts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={refresh}
          ListHeaderComponent={
            companiesHeader || openFolderHeader ? (
              <View>
                {companiesHeader}
                {openFolderHeader ? <View style={styles.blockGap} /> : null}
                {openFolderHeader}
                {companiesHeader ? (
                  <SectionHeader title="Ürünler" count={visibleProducts.length} />
                ) : (
                  <View style={styles.blockGap} />
                )}
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
              divider={index < visibleProducts.length - 1}
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
    paddingTop: 10,
    paddingBottom: spacing.sm,
  },
  searchField: { flex: 1 },
  myCompany: { paddingHorizontal: spacing.gutter },
  toggleBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  toggleOption: {
    flex: 1,
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  toggleSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  togglePressed: { backgroundColor: colors.pressed },
  toggleText: { ...typography.label, fontFamily: fonts.semibold, color: colors.textMuted },
  toggleTextSelected: { color: colors.primaryText },
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
  folderIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.gutter,
    backgroundColor: colors.surface,
  },
  rowPressed: { backgroundColor: colors.pressed },
  folderBackTitle: { ...typography.subtitle, color: colors.primary, flex: 1 },
  folderBackCount: { ...typography.mono, color: colors.textMuted },
});
