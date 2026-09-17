import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MainTabScreenProps } from '../../navigation/types';
import { ApiError, createWatchRule, fetchProductList, searchCompanies } from '../../api/client';
import { mockProducts } from '../../data/mockProducts';
import { useSession } from '../../context/SessionContext';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { ProductRow } from '../../components/ProductRow';
import { ProductThumbnail } from '../../components/ProductThumbnail';
import { ListRow } from '../../components/ListRow';
import { SectionHeader } from '../../components/SectionHeader';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SearchField } from '../../components/SearchField';
import { haptics } from '../../features/haptics';
import { PRODUCT_TYPES, SUBTYPES, TYPE_LABELS, USAGES, typeLabel, type ProductType } from '../../features/products/catalog';
import {
  EMPTY_FILTERS,
  activeFilterChips,
  unsupportedWatchFilterLabels,
  watchQueryFromFilters,
  type ProductFilters,
} from '../../features/products/filters';
import type { Company, Product } from '../../types';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

type Props = MainTabScreenProps<'ProductList'>;

// Kullanıcı isteği (2026-09-15): ürünler ya tek akışta ("Tümü") ya da kumaş
// çeşidine göre klasörlerde ("Çeşitler") görülebilsin; seçim hatırlanır.
// Aşama A: klasör içinde alt çeşit çipleri, kullanım amacı kısayolları, filtreler.
type ViewMode = 'all' | 'groups';
const VIEW_MODE_KEY = 'avedon.productListViewMode';

// Sunucuya ulaşılamazsa örnek veri; filtrelerin en temel ikisi uygulanır.
function filterMock(search: string, filters: ProductFilters) {
  const q = search.trim().toLocaleLowerCase('tr-TR');
  return mockProducts.filter(
    (p) =>
      (!filters.type || p.type === filters.type) &&
      (!q || [p.code, p.content, p.useArea, typeLabel(p.type)].join(' ').toLocaleLowerCase('tr-TR').includes(q))
  );
}

// Taslak: docs/tasarim-yonleri/CUrunler.dc.html. Üstte beyaz arama çubuğu
// (yanında filtre ve "Firmam"), altta gri aralıktan sonra çizgili ürün satırları.
export function ProductListScreen({ navigation, route }: Props) {
  const { user } = useSession();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<ProductFilters>(EMPTY_FILTERS);
  const [products, setProducts] = useState<Product[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [openType, setOpenType] = useState<ProductType | null>(null);
  // null: klasördeki tüm ürünler · '': alt çeşidi belirtilmemiş olanlar
  const [openSubtype, setOpenSubtype] = useState<string | null>(null);
  // "Bu aramayı izle" sonucu: kısa onay ya da açıklama (Faz 2, Adım 1).
  const [watchNote, setWatchNote] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const [watchSaving, setWatchSaving] = useState(false);
  const queryRef = useRef(query);
  queryRef.current = query;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => {
    AsyncStorage.getItem(VIEW_MODE_KEY)
      .then((saved) => {
        if (saved === 'all' || saved === 'groups') setViewMode(saved);
      })
      .catch(() => {});
  }, []);

  // Filtre ekranı "Uygula"da buraya döner.
  const appliedAt = route.params?.appliedAt;
  useEffect(() => {
    if (route.params?.filters) {
      setFilters(route.params.filters);
      setOpenType(null);
      setOpenSubtype(null);
    }
    // appliedAt her uygulamada değişir; filtre nesnesinin kendisine bakılmıyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedAt]);

  const changeViewMode = (mode: ViewMode) => {
    if (mode === viewMode) return;
    haptics.selection();
    setViewMode(mode);
    setOpenType(null);
    setOpenSubtype(null);
    AsyncStorage.setItem(VIEW_MODE_KEY, mode).catch(() => {});
  };

  // pull: aşağı çekip yenileme — liste yerinde kalır, üstte gösterge döner.
  const loadProducts = useCallback(
    (search: string, activeFilters: ProductFilters, signal: { cancelled: boolean }, pull = false) => {
      if (pull) setRefreshing(true);
      else setLoading(true);
      fetchProductList(search, activeFilters)
        .then(({ products: fetched }) => {
          if (signal.cancelled) return;
          setProducts(fetched);
          setOffline(false);
        })
        .catch(() => {
          if (signal.cancelled) return;
          setProducts(filterMock(search, activeFilters));
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
    },
    []
  );

  useEffect(() => {
    // Arama ya da süzgeç değişti: "İzlemeye alındı" notu artık o aramaya ait değil.
    setWatchNote(null);
    const signal = { cancelled: false };
    const timer = setTimeout(() => loadProducts(query, filters, signal), 300);
    return () => {
      signal.cancelled = true;
      clearTimeout(timer);
    };
  }, [query, filters, loadProducts]);

  useFocusEffect(
    useCallback(() => {
      const signal = { cancelled: false };
      loadProducts(queryRef.current, filtersRef.current, signal);
      return () => {
        signal.cancelled = true;
      };
    }, [loadProducts])
  );

  const chips = activeFilterChips(filters);

  const typeGroups = useMemo(
    () =>
      PRODUCT_TYPES.map((type) => {
        const items = products.filter((p) => p.type === type);
        return {
          type,
          count: items.length,
          cover: items.find((p) => p.hasImage) ?? null,
          subtypeCount: new Set(items.map((p) => p.subtype).filter(Boolean)).size,
        };
      }).filter((g) => g.count > 0),
    [products]
  );

  const usageGroups = useMemo(
    () =>
      USAGES.map((u) => ({ ...u, count: products.filter((p) => p.usages?.includes(u.key)).length })).filter(
        (g) => g.count > 0
      ),
    [products]
  );

  const subtypeGroups = useMemo(() => {
    if (!openType) return [];
    const inType = products.filter((p) => p.type === openType);
    const known = SUBTYPES[openType]
      .map((s) => ({ key: s.key, label: s.label, count: inType.filter((p) => p.subtype === s.key).length }))
      .filter((g) => g.count > 0);
    const unspecified = inType.filter((p) => !p.subtype || !SUBTYPES[openType].some((s) => s.key === p.subtype)).length;
    return unspecified > 0 && known.length > 0 ? [...known, { key: '', label: 'Belirtilmemiş', count: unspecified }] : known;
  }, [products, openType]);

  const showFolders = viewMode === 'groups' && openType === null && !query.trim();
  const inOpenFolder = viewMode === 'groups' && openType !== null;
  const visibleProducts = inOpenFolder
    ? products.filter(
        (p) =>
          p.type === openType &&
          (openSubtype === null ||
            (openSubtype === ''
              ? !p.subtype || !SUBTYPES[openType!].some((s) => s.key === p.subtype)
              : p.subtype === openSubtype))
      )
    : products;

  const refresh = refreshControl(refreshing, () =>
    loadProducts(queryRef.current, filtersRef.current, { cancelled: false }, true)
  );

  const openFilters = () => navigation.navigate('ProductFilters', { filters });

  // Etkin süzgeci (ve arama metnini) izleme kuralına çevirir. Ad verilmiyor:
  // sunucu süzgeçten okunur bir ad üretiyor.
  const watchCurrentSearch = async () => {
    if (watchSaving) return;
    const watchQuery = watchQueryFromFilters(query, filters);
    if (!watchQuery) {
      setWatchNote({ text: 'Bu süzgeç izlemeye çevrilemiyor. Çeşit, lif, gramaj ya da sertifika seçin.', tone: 'error' });
      return;
    }
    setWatchSaving(true);
    try {
      await createWatchRule({ query: watchQuery });
      haptics.success();
      const dropped = unsupportedWatchFilterLabels(filters);
      setWatchNote({
        text: dropped.length ? `İzlemeye alındı (${dropped.join(', ')} izlemeye girmez).` : 'İzlemeye alındı.',
        tone: 'ok',
      });
    } catch (err) {
      haptics.error();
      setWatchNote({
        text:
          err instanceof ApiError && err.code === 'too_many_rules'
            ? 'İzleme sınırına ulaştınız. Profil > İzlediklerim listesinden birini silin.'
            : 'İzleme kurulamadı, tekrar deneyin.',
        tone: 'error',
      });
    } finally {
      setWatchSaving(false);
    }
  };

  const applyUsageShortcut = (key: string) => {
    haptics.selection();
    setFilters((prev) => ({ ...prev, usages: [key] }));
  };

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
            style={({ pressed }) => [
              styles.toggleOption,
              selected && styles.toggleSelected,
              pressed && !selected && styles.togglePressed,
            ]}
          >
            <Ionicons name={option.icon} size={18} color={selected ? colors.primaryText : colors.textMuted} />
            <Text style={[styles.toggleText, selected && styles.toggleTextSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const filterChipsBar =
    chips.length > 0 ? (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsBar}
        contentContainerStyle={styles.chipsContent}
        keyboardShouldPersistTaps="handled"
      >
        {chips.map((chip) => (
          <Pressable
            key={chip.key}
            onPress={() => {
              haptics.selection();
              setFilters((prev) => chip.remove(prev));
            }}
            accessibilityRole="button"
            accessibilityLabel={`${chip.label} filtresini kaldır`}
            style={({ pressed }) => [styles.activeChip, pressed && styles.activeChipPressed]}
          >
            <Text style={styles.activeChipText}>{chip.label}</Text>
            <Ionicons name="close" size={15} color={colors.primary} />
          </Pressable>
        ))}
        <Pressable
          onPress={() => {
            haptics.selection();
            setFilters(EMPTY_FILTERS);
          }}
          accessibilityRole="button"
          accessibilityLabel="Tüm filtreleri temizle"
          style={({ pressed }) => [styles.clearChip, pressed && styles.pressedFade]}
        >
          <Text style={styles.clearChipText}>Temizle</Text>
        </Pressable>
        {/* Faz 2, Adım 1: etkin süzgeci izlemeye alma kısayolu. */}
        <Pressable
          onPress={() => void watchCurrentSearch()}
          disabled={watchSaving}
          accessibilityRole="button"
          accessibilityLabel="Bu aramayı izle, uyan yeni ürün çıkınca haber ver"
          accessibilityState={{ disabled: watchSaving }}
          style={({ pressed }) => [styles.watchChip, pressed && styles.pressedFade]}
        >
          <Ionicons name="bookmark-outline" size={15} color={colors.primary} />
          <Text style={styles.watchChipText}>{watchSaving ? 'Kuruluyor...' : 'Bu aramayı izle'}</Text>
        </Pressable>
      </ScrollView>
    ) : null;

  const companiesHeader =
    companies.length > 0 ? (
      <View>
        <SectionHeader title="Firmalar" first />
        <View style={styles.block}>
          {companies.map((c, index) => (
            <ListRow
              key={c.id}
              title={c.name}
              left={
                <CompanyAvatar
                  name={c.name}
                  verification={c.verification}
                  size={36}
                  companyId={c.id}
                  logoUpdatedAt={c.logoUpdatedAt}
                />
              }
              divider={index < companies.length - 1}
              onPress={() => navigation.navigate('CompanyProfile', { companyId: c.id })}
            />
          ))}
        </View>
      </View>
    ) : null;

  const openFolderHeader = inOpenFolder ? (
    <View style={styles.block}>
      <Pressable
        onPress={() => {
          haptics.selection();
          setOpenType(null);
          setOpenSubtype(null);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${TYPE_LABELS[openType!]} klasöründen çık, tüm çeşitlere dön`}
        style={({ pressed }) => [styles.folderBack, pressed && styles.rowPressed]}
      >
        <Ionicons name="chevron-back" size={20} color={colors.primary} />
        <Ionicons name="folder-open-outline" size={20} color={colors.primary} />
        <Text style={styles.folderBackTitle}>{TYPE_LABELS[openType!]}</Text>
        <Text style={styles.folderBackCount}>{visibleProducts.length} ürün</Text>
      </Pressable>
      {subtypeGroups.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.subtypeStrip}
          style={styles.subtypeStripWrap}
        >
          {[{ key: null as string | null, label: 'Tümü', count: products.filter((p) => p.type === openType).length }, ...subtypeGroups].map(
            (group) => {
              const selected = openSubtype === group.key;
              return (
                <Pressable
                  key={group.key ?? 'tumu'}
                  onPress={() => {
                    haptics.selection();
                    setOpenSubtype(group.key);
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${group.label}, ${group.count} ürün`}
                  style={({ pressed }) => [styles.subtypeChip, selected && styles.subtypeChipSelected, pressed && !selected && styles.togglePressed]}
                >
                  <Text style={[styles.subtypeChipText, selected && styles.toggleTextSelected]}>{group.label}</Text>
                  <Text style={[styles.subtypeChipCount, selected && styles.toggleTextSelected]}>{group.count}</Text>
                </Pressable>
              );
            }
          )}
        </ScrollView>
      ) : null}
    </View>
  ) : null;

  const usageShortcuts =
    usageGroups.length > 0 && filters.usages.length === 0 ? (
      <View>
        <SectionHeader title="Kullanım amacına göre" first />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.block}
          contentContainerStyle={styles.usageStrip}
        >
          {usageGroups.map((group) => (
            <Pressable
              key={group.key}
              onPress={() => applyUsageShortcut(group.key)}
              accessibilityRole="button"
              accessibilityLabel={`${group.label} kumaşlar, ${group.count} ürün`}
              style={({ pressed }) => [styles.usageChip, pressed && styles.togglePressed]}
            >
              <Text style={styles.usageChipText}>{group.label}</Text>
              <Text style={styles.usageChipCount}>{group.count}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    ) : null;

  const emptyState = query.trim() ? (
    <EmptyState
      icon="search-outline"
      title="Sonuç bulunamadı"
      message={
        companies.length > 0
          ? `"${query.trim()}" ile eşleşen ürün yok; yukarıdaki firmalara göz atabilirsiniz.`
          : `"${query.trim()}" ile eşleşen ürün ya da firma yok. İçerik, çeşit veya kullanım amacıyla deneyin.`
      }
      actionLabel="Aramayı temizle"
      onAction={() => setQuery('')}
    />
  ) : chips.length > 0 ? (
    <EmptyState
      icon="options-outline"
      title="Filtreye uyan ürün yok"
      message="Filtrelerden birkaçını kaldırarak tekrar deneyin."
      actionLabel="Filtreleri temizle"
      onAction={() => setFilters(EMPTY_FILTERS)}
    />
  ) : (
    <EmptyState icon="cube-outline" title="Henüz ürün yok" message="Üreticiler ürün ekledikçe katalog burada dolacak." />
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Kod, içerik, çeşit, kullanım ara"
          accessibilityLabel="Ürün ve firma ara"
          style={styles.searchField}
        />
        <Pressable
          onPress={openFilters}
          accessibilityRole="button"
          accessibilityLabel={chips.length ? `Filtrele, ${chips.length} filtre etkin` : 'Filtrele'}
          style={({ pressed }) => [styles.filterButton, chips.length > 0 && styles.filterButtonActive, pressed && styles.togglePressed]}
        >
          <Ionicons name="options-outline" size={22} color={chips.length ? colors.primaryText : colors.primary} />
          {chips.length > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{chips.length}</Text>
            </View>
          ) : null}
        </Pressable>
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
      {filterChipsBar}
      {watchNote ? (
        <Text
          style={[styles.watchNote, watchNote.tone === 'error' && styles.watchNoteError]}
          accessibilityLiveRegion="polite"
        >
          {watchNote.text}
        </Text>
      ) : null}
      {offline ? <Text style={styles.offlineNotice}>Sunucuya ulaşılamadı, örnek veriler gösteriliyor.</Text> : null}
      {loading && products.length === 0 ? (
        <SkeletonList variant="product" />
      ) : showFolders ? (
        <FlatList
          data={typeGroups}
          keyExtractor={(item) => item.type}
          contentContainerStyle={styles.listContent}
          refreshControl={refresh}
          ListHeaderComponent={
            <View>
              {usageShortcuts}
              <SectionHeader title="Kumaş çeşitleri" count={typeGroups.length} first={!usageShortcuts} />
            </View>
          }
          ListEmptyComponent={emptyState}
          renderItem={({ item, index }) => (
            <ListRow
              title={TYPE_LABELS[item.type]}
              subtitle={item.subtypeCount > 0 ? `${item.count} ürün · ${item.subtypeCount} alt çeşit` : `${item.count} ürün`}
              left={
                item.cover ? (
                  <ProductThumbnail productId={item.cover.id} hasImage size={44} />
                ) : (
                  <View style={styles.folderIcon}>
                    <Ionicons name="folder" size={22} color={colors.primary} />
                  </View>
                )
              }
              divider={index < typeGroups.length - 1}
              accessibilityLabel={`${TYPE_LABELS[item.type]} klasörü, ${item.count} ürün`}
              onPress={() => {
                haptics.selection();
                setOpenType(item.type);
                setOpenSubtype(null);
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
          }
          ListEmptyComponent={emptyState}
          renderItem={({ item, index }) => (
            <ProductRow
              product={item}
              divider={index < visibleProducts.length - 1}
              onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
              onRequestSample={
                user && user.companyId !== item.companyId
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
  filterButton: {
    width: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  filterButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.notification,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  filterBadgeText: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, color: colors.primaryText },
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
  chipsBar: { flexGrow: 0, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  chipsContent: { gap: spacing.sm, paddingHorizontal: spacing.gutter, paddingVertical: spacing.sm, alignItems: 'center' },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  activeChipPressed: { backgroundColor: colors.pressed },
  activeChipText: { ...typography.label, fontFamily: fonts.semibold, color: colors.primary },
  clearChip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.xs },
  clearChipText: { ...typography.label, fontFamily: fonts.semibold, color: colors.danger },
  pressedFade: { opacity: 0.6 },
  watchChip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: spacing.xs },
  watchChipText: { ...typography.label, fontFamily: fonts.semibold, color: colors.primary },
  watchNote: {
    ...typography.caption,
    color: colors.success,
    backgroundColor: colors.successSoft,
    paddingHorizontal: spacing.gutter,
    paddingVertical: 6,
  },
  watchNoteError: { color: colors.danger, backgroundColor: colors.dangerSoft },
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
    width: 44,
    height: 44,
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
  subtypeStripWrap: { borderTopWidth: 1, borderTopColor: colors.divider },
  subtypeStrip: { gap: spacing.sm, paddingHorizontal: spacing.gutter, paddingVertical: 10 },
  subtypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  subtypeChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  subtypeChipText: { ...typography.label, fontFamily: fonts.semibold, color: colors.text },
  subtypeChipCount: { ...typography.mono, fontSize: 13, lineHeight: 17, color: colors.textMuted },
  usageStrip: { gap: spacing.sm, paddingHorizontal: spacing.gutter, paddingVertical: 10 },
  usageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTonal,
    borderWidth: 1,
    borderColor: colors.border,
  },
  usageChipText: { ...typography.label, fontFamily: fonts.semibold, color: colors.text },
  usageChipCount: { ...typography.mono, fontSize: 13, lineHeight: 17, color: colors.textMuted },
});
