// Katalog / arama ekranı — yeni tasarım sistemi (DESIGN.md, artboard 2).
// Düzen: AppBar "Katalog" (sağda fotoğrafla ara + süzgeç) · 48px arama kutusu ·
// kapsam ve çeşit çipleri · "N sonuç" + sıralama · ProductCard listesi.
// Veri/işlev katmanı (api çağrıları, süzgeç, izleme, teklif seçimi, iplik
// dizini, sayfa parametreleri) eski sürümden aynen korunur; yalnızca görünüm
// yeniden çizildi. Ham hex / ham px yok: her değer useTheme() token'ından.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MainTabScreenProps } from '../../navigation/types';
import { ApiError, createWatchRule, fetchProductList, searchCompanies } from '../../api/client';
import { mockProducts } from '../../data/mockProducts';
import { useSession } from '../../context/SessionContext';
import { haptics } from '../../features/haptics';
import { formatMeasure } from '../../features/calculators/parse';
import { formatComposition } from '../../features/products/glossaryLabels';
import {
  PRODUCT_TYPES,
  SUBTYPES,
  categoryLabel,
  TYPE_LABELS,
  USAGES,
  isYarnType,
  typeLabel,
  type ProductType,
} from '../../features/products/catalog';
import {
  EMPTY_FILTERS,
  activeFilterChips,
  unsupportedWatchFilterLabels,
  watchQueryFromFilters,
  type ProductFilters,
} from '../../features/products/filters';
import { useRfqSelection, type RfqSelectionItem } from '../../features/quotes/rfqSelection';
import { getCachedProductImage, loadProductImage } from '../../features/products/productImageCache';
import { YarnDirectory } from '../yarns/YarnDirectoryScreen';
import type { Company, Product } from '../../types';
import { useTheme } from '../../theme/ThemeContext';
import {
  AppBar,
  Badge,
  BottomSheet,
  Button,
  Chip,
  ChipRow,
  EmptyState,
  Icon,
  ListRow,
  ProductCard,
  Screen,
  SectionTitle,
  Skeleton,
} from '../../ui';

type Props = MainTabScreenProps<'ProductList'>;

// Kullanıcı isteği (2026-09-15): ürünler ya tek akışta ("Tümü") ya da kumaş
// çeşidine göre ("Çeşitler") görülebilsin; seçim hatırlanır. Yeni tasarımda
// klasör listesi yerine çeşit ÇİPLERİ var, mantık aynı.
type ViewMode = 'all' | 'groups';
const VIEW_MODE_KEY = 'avedon.productListViewMode';

// Faz 2, Adım 6: ürün sekmesi ikiye ayrıldı. "Kumaş" mevcut katalog,
// "İplik" iplik dizini. Seçim cihazda hatırlanır.
type Domain = 'kumas' | 'iplik';
const DOMAIN_KEY = 'avedon.productListDomain';

// Sıralama yalnızca GÖRÜNÜM işidir: sunucuya gitmez, eldeki liste sıralanır.
type SortKey = 'onerilen' | 'gramaj' | 'en' | 'stok';
const SORT_LABELS: Record<SortKey, string> = {
  onerilen: 'Önerilen',
  gramaj: 'Gramaja göre',
  en: 'Ene göre',
  stok: 'Stoğa göre',
};

// Sunucuya ulaşılamazsa örnek veri; filtrelerin en temel ikisi uygulanır.
function filterMock(search: string, filters: ProductFilters) {
  const q = search.trim().toLocaleLowerCase('tr-TR');
  return mockProducts.filter(
    (p) =>
      (!filters.type || p.type === filters.type) &&
      (!q || [p.code, p.content, p.useArea, typeLabel(p.type)].join(' ').toLocaleLowerCase('tr-TR').includes(q))
  );
}

// Kart özellik satırı: "165 gr/m² · 160 cm · %94 PES %6 EA" (DESIGN.md §3).
// İplikte gramaj/en 0'dır, onun yerine ipliğin kendi özeti yazılır.
function specsOf(product: Product): string {
  if (isYarnType(product.type)) return product.yarn?.summary || product.content;
  const composition = product.composition ?? [];
  const content = composition.length ? formatComposition(composition) : product.content;
  return [`${formatMeasure(product.weightGsm)} gr/m²`, `${formatMeasure(product.widthCm)} cm`, content]
    .filter(Boolean)
    .join(' · ');
}

// Kapak fotoğrafı liste yanıtında gelmiyor; önbellekten / tek tek çekilir.
function useProductImage(productId: string, hasImage: boolean) {
  const [uri, setUri] = useState<string | null>(() => getCachedProductImage(productId) ?? null);
  useEffect(() => {
    if (!hasImage) return;
    const cached = getCachedProductImage(productId);
    if (cached) {
      setUri(cached);
      return;
    }
    let cancelled = false;
    loadProductImage(productId)
      .then((url) => {
        if (!cancelled) setUri(url);
      })
      .catch(() => {
        // Fotoğraf gelmezse kart yer tutucuyla çalışır.
      });
    return () => {
      cancelled = true;
    };
  }, [productId, hasImage]);
  return uri;
}

export function ProductListScreen({ navigation, route }: Props) {
  const t = useTheme();
  const { user } = useSession();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<ProductFilters>(EMPTY_FILTERS);
  const [products, setProducts] = useState<Product[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [domain, setDomain] = useState<Domain>('kumas');
  const [openType, setOpenType] = useState<ProductType | null>(null);
  // null: çeşidin tüm ürünleri · '': alt çeşidi belirtilmemiş olanlar
  const [openSubtype, setOpenSubtype] = useState<string | null>(null);
  // "Bu aramayı izle" sonucu: kısa onay ya da açıklama (Faz 2, Adım 1).
  const [watchNote, setWatchNote] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const [watchSaving, setWatchSaving] = useState(false);
  const [sort, setSort] = useState<SortKey>('onerilen');
  const [sortOpen, setSortOpen] = useState(false);
  // Çoklu teklif isteme (Faz 3, Adım 1): "Teklif için seç" kipi.
  const selection = useRfqSelection();
  const queryRef = useRef(query);
  queryRef.current = query;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // Genel aramadaki "Tümünü gör" bu ekranı arama metniyle açar.
  const initialSearchKey = route.params?.searchKey;
  useEffect(() => {
    const initial = route.params?.initialSearch;
    if (initial === undefined) return;
    setDomain('kumas');
    setQuery(initial);
    setOpenType(null);
    setOpenSubtype(null);
    // searchKey her açılışta değişir; metnin kendisine bakılmıyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSearchKey]);

  useEffect(() => {
    AsyncStorage.getItem(VIEW_MODE_KEY)
      .then((saved) => {
        if (saved === 'all' || saved === 'groups') setViewMode(saved);
      })
      .catch(() => {});
    AsyncStorage.getItem(DOMAIN_KEY)
      .then((saved) => {
        if (saved === 'kumas' || saved === 'iplik') setDomain(saved);
      })
      .catch(() => {});
  }, []);

  const changeDomain = (next: Domain) => {
    if (next === domain) return;
    haptics.selection();
    setDomain(next);
    AsyncStorage.setItem(DOMAIN_KEY, next).catch(() => {});
  };

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
    setViewMode(mode);
    AsyncStorage.setItem(VIEW_MODE_KEY, mode).catch(() => {});
  };

  // Çeşit çipi: "Tümü" tek akış, bir çeşit seçilince o çeşidin klasörü açılır.
  const chooseType = (next: ProductType | null) => {
    haptics.selection();
    setOpenType(next);
    setOpenSubtype(null);
    changeViewMode(next === null ? 'all' : 'groups');
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
      PRODUCT_TYPES.map((type) => ({ type, count: products.filter((p) => p.type === type).length })).filter(
        (g) => g.count > 0
      ),
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
      .map((s) => ({ key: s.key as string | null, label: s.label, count: inType.filter((p) => p.subtype === s.key).length }))
      .filter((g) => g.count > 0);
    const unspecified = inType.filter((p) => !p.subtype || !SUBTYPES[openType].some((s) => s.key === p.subtype)).length;
    return unspecified > 0 && known.length > 0
      ? [...known, { key: '' as string | null, label: 'Belirtilmemiş', count: unspecified }]
      : known;
  }, [products, openType]);

  const inOpenFolder = viewMode === 'groups' && openType !== null;
  const filtered = inOpenFolder
    ? products.filter(
        (p) =>
          p.type === openType &&
          (openSubtype === null ||
            (openSubtype === ''
              ? !p.subtype || !SUBTYPES[openType!].some((s) => s.key === p.subtype)
              : p.subtype === openSubtype))
      )
    : products;

  // Sıralama yalnızca görünüm: "Önerilen" sunucunun verdiği sırayı korur.
  const visibleProducts = useMemo(() => {
    if (sort === 'onerilen') return filtered;
    const copy = [...filtered];
    if (sort === 'gramaj') copy.sort((a, b) => (a.weightGsm ?? 0) - (b.weightGsm ?? 0));
    else if (sort === 'en') copy.sort((a, b) => (a.widthCm ?? 0) - (b.widthCm ?? 0));
    else copy.sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0));
    return copy;
    // filtered her hesaplamada yeni dizi; içeriği products/süzgeçten türüyor.
  }, [filtered, sort]);

  const refresh = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => loadProducts(queryRef.current, filtersRef.current, { cancelled: false }, true)}
      colors={[t.colors.brand]}
      tintColor={t.colors.brand}
      progressBackgroundColor={t.colors.surface1}
    />
  );

  const openFilters = () => navigation.navigate('ProductFilters', { filters });

  // Etkin süzgeci (ve arama metnini) izleme kuralına çevirir.
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

  // "Bu aramayı izle" arama kutusunda en az iki karakter varken de çıkar.
  const canWatchSearch = query.trim().length >= 2;

  // --- Görünüm parçaları -----------------------------------------------------

  const gutter = { paddingHorizontal: t.space[4] } as const;

  const searchBox = (
    <View
      style={[
        gutter,
        { flexDirection: 'row', alignItems: 'center', gap: t.space[2] },
      ]}
    >
      <View
        style={{
          flex: 1,
          minWidth: 0,
          height: t.size.control,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[2],
          paddingHorizontal: t.space[3],
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: t.colors.lineStrong,
          backgroundColor: t.colors.surface1,
        }}
      >
        <Icon name="search" size={t.size.iconSm} color="ink3" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Kod, içerik, çeşit, kullanım ara"
          placeholderTextColor={t.colors.ink3}
          accessibilityLabel="Ürün ve firma ara"
          returnKeyType="search"
          style={[t.type.body16, { flex: 1, minWidth: 0, color: t.colors.ink, paddingVertical: 0 }]}
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel="Aramayı temizle"
            hitSlop={t.space[2]}
            style={{ width: t.space[6], height: t.space[6], alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="x" size={t.size.iconSm} color="ink2" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  // Kapsam çipleri: Kumaş | İplik (+ teklif seçim kipi ve giriş gerektiren kısayollar).
  const scopeChips = (
    <ChipRow style={gutter}>
      <Chip label="Kumaş" icon="fabric" selected={domain === 'kumas'} onPress={() => changeDomain('kumas')} />
      <Chip label="İplik" icon="yarn" selected={domain === 'iplik'} onPress={() => changeDomain('iplik')} />
      {user ? (
        <Chip
          label={selection.active ? 'Seçmeyi bırak' : 'Teklif için seç'}
          icon={selection.active ? 'x' : 'check'}
          selected={selection.active}
          onPress={() => {
            haptics.selection();
            if (selection.active) selection.cancel();
            else selection.start();
          }}
        />
      ) : null}
      {user ? (
        <Chip label="Fason kapasite" icon="machine" onPress={() => navigation.navigate('CapacitySearch')} />
      ) : null}
      {user?.companyId ? (
        <Chip label="Firmam" icon="user" onPress={() => navigation.navigate('CompanyProfile')} />
      ) : null}
    </ChipRow>
  );

  // Çeşit çipleri (eski "Tümü | Çeşitler" seçimi + klasörler).
  const typeChips =
    typeGroups.length > 0 ? (
      <ChipRow style={gutter}>
        <Chip label="Tümü" selected={!inOpenFolder} onPress={() => chooseType(null)} />
        {typeGroups.map((g) => (
          <Chip
            key={g.type}
            label={`${TYPE_LABELS[g.type]} (${g.count})`}
            selected={inOpenFolder && openType === g.type}
            onPress={() => chooseType(g.type)}
          />
        ))}
      </ChipRow>
    ) : null;

  const subtypeChips =
    inOpenFolder && subtypeGroups.length > 0 ? (
      <ChipRow style={gutter}>
        {[{ key: null as string | null, label: 'Hepsi' }, ...subtypeGroups].map((g) => (
          <Chip
            key={g.key ?? 'hepsi'}
            label={g.label}
            selected={openSubtype === g.key}
            onPress={() => {
              haptics.selection();
              setOpenSubtype(g.key);
            }}
          />
        ))}
      </ChipRow>
    ) : null;

  const usageChips =
    !inOpenFolder && usageGroups.length > 0 && filters.usages.length === 0 ? (
      <ChipRow style={gutter}>
        {usageGroups.map((g) => (
          <Chip key={g.key} label={`${g.label} (${g.count})`} onPress={() => applyUsageShortcut(g.key)} />
        ))}
      </ChipRow>
    ) : null;

  // Etkin süzgeçler + temizle + "bu aramayı izle".
  const filterChips =
    chips.length > 0 || canWatchSearch ? (
      <ChipRow style={gutter}>
        {chips.map((chip) => (
          <Chip
            key={chip.key}
            label={chip.label}
            icon="x"
            selected
            onPress={() => {
              haptics.selection();
              setFilters((prev) => chip.remove(prev));
            }}
          />
        ))}
        {chips.length > 0 ? (
          <Chip
            label="Temizle"
            onPress={() => {
              haptics.selection();
              setFilters(EMPTY_FILTERS);
            }}
          />
        ) : null}
        <Chip
          label={watchSaving ? 'Kuruluyor…' : 'Bu aramayı izle'}
          icon="bookmark-outline"
          disabled={watchSaving}
          onPress={() => void watchCurrentSearch()}
        />
      </ChipRow>
    ) : null;

  // Ekran içi ince uyarı satırı (çevrimdışı, izleme notu, seçim ipucu).
  const notice = (text: string, tone: 'ok' | 'error' | 'info') => (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        gutter,
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[2],
          paddingVertical: t.space[2],
        },
      ]}
    >
      <Icon
        name={tone === 'error' ? 'warning' : tone === 'ok' ? 'check' : 'info'}
        size={t.size.iconSm}
        color={tone === 'error' ? 'danger' : tone === 'ok' ? 'success' : 'ink2'}
      />
      <Text
        style={[
          t.type.body14,
          { flex: 1, color: tone === 'error' ? t.colors.danger : tone === 'ok' ? t.colors.success : t.colors.ink2 },
        ]}
      >
        {text}
      </Text>
    </View>
  );

  const resultBar = (
    <View
      style={[
        gutter,
        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space[2] },
      ]}
    >
      <Text style={[t.type.body14, { color: t.colors.ink2, flexShrink: 1 }]} numberOfLines={1}>
        {`${visibleProducts.length} sonuç`}
        {filters.stockMin !== undefined || filters.stockUnit ? ' · stokta olanlar' : ''}
      </Text>
      <Pressable
        onPress={() => setSortOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Sıralama: ${SORT_LABELS[sort]}, değiştir`}
        style={({ pressed }) => ({
          minHeight: t.size.touchMin,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[1],
          paddingHorizontal: t.space[2],
          marginRight: -t.space[2],
          borderRadius: t.radius.md,
          backgroundColor: pressed ? t.colors.surface2 : 'transparent',
        })}
      >
        <Text style={[t.type.label14, { color: t.colors.brand }]}>{SORT_LABELS[sort]}</Text>
        <Icon name="chevron-down-outline" size={t.size.iconSm} color="brand" />
      </Pressable>
    </View>
  );

  const companiesHeader =
    companies.length > 0 ? (
      <View style={{ gap: t.space[2], paddingBottom: t.space[4] }}>
        <SectionTitle title="Firmalar" style={gutter} />
        <View style={gutter}>
          {companies.map((c, index) => (
            <ListRow
              key={c.id}
              title={c.name}
              subtitle={c.verification === 'dogrulanmis' ? 'Doğrulanmış firma' : undefined}
              avatarName={c.name}
              avatarKind="company"
              divider={index < companies.length - 1}
              right={c.verification === 'dogrulanmis' ? <Badge kind="verified" /> : undefined}
              onPress={() => navigation.navigate('CompanyProfile', { companyId: c.id })}
            />
          ))}
        </View>
      </View>
    ) : null;

  const emptyState = query.trim() ? (
    <EmptyState
      icon="search"
      title="Sonuç bulunamadı"
      description={
        companies.length > 0
          ? `"${query.trim()}" ile eşleşen ürün yok; yukarıdaki firmalara göz atabilirsiniz.`
          : `"${query.trim()}" ile eşleşen ürün ya da firma yok. İçerik, çeşit veya kullanım amacıyla deneyin.`
      }
      actionLabel="Aramayı temizle"
      onAction={() => setQuery('')}
    />
  ) : chips.length > 0 ? (
    <EmptyState
      icon="filter"
      title="Filtreye uyan ürün yok"
      description="Filtrelerden birkaçını kaldırarak tekrar deneyin."
      actionLabel="Filtreleri temizle"
      onAction={() => setFilters(EMPTY_FILTERS)}
    />
  ) : (
    <EmptyState icon="sample" title="Henüz ürün yok" description="Üreticiler ürün ekledikçe katalog burada dolacak." />
  );

  const skeleton = (
    <View style={[gutter, { gap: t.space[3] }]}>
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            gap: t.space[3],
            padding: t.space[4],
            borderRadius: t.radius.lg,
            borderWidth: 1,
            borderColor: t.colors.line,
            backgroundColor: t.colors.surface1,
          }}
        >
          <Skeleton width={t.size.thumb} height={t.size.thumb} />
          <View style={{ flex: 1, gap: t.space[2] }}>
            <Skeleton width="70%" height={t.space[4]} />
            <Skeleton width="45%" height={t.space[3]} />
            <Skeleton width="85%" height={t.space[3]} />
          </View>
        </View>
      ))}
    </View>
  );

  const appBar = (
    <AppBar
      title="Katalog"
      leading="none"
      actions={[
        ...(user
          ? [
              {
                icon: 'camera' as const,
                label: 'Fotoğrafla benzer kumaş ara',
                onPress: () => navigation.navigate('SimilarSearch'),
              },
            ]
          : []),
        {
          icon: 'filter' as const,
          label: chips.length ? `Süzgeçler, ${chips.length} süzgeç etkin` : 'Süzgeçler',
          onPress: openFilters,
          dot: chips.length > 0,
        },
      ]}
    />
  );

  // Teklif seçim şeridi (RfqSelectionBar'ın token'lara uydurulmuş yerel sürümü).
  const canSubmitRfq = selection.companyCount >= 2;
  const rfqBar = selection.active ? (
    <View style={{ gap: t.space[2] }}>
      <Text style={[t.type.label14, { color: t.colors.ink }]}>
        {selection.items.length} ürün · {selection.companyCount} firma seçildi
      </Text>
      {!canSubmitRfq ? (
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>En az 2 farklı firmadan ürün seçin.</Text>
      ) : null}
      {selection.hasDuplicateCompany ? (
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
          Aynı firmadan yalnızca ilk seçtiğiniz ürün için istek gider.
        </Text>
      ) : null}
      {selection.manyCompanies ? (
        <Text style={[t.type.body14, { color: t.colors.warning }]}>
          5'ten fazla firmaya sorunca cevap oranı düşebilir.
        </Text>
      ) : null}
      {selection.limitNote ? (
        <Text style={[t.type.body14, { color: t.colors.danger }]} accessibilityLiveRegion="polite">
          {selection.limitNote}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: t.space[2] }}>
        <Button kind="secondary" label="Vazgeç" onPress={selection.cancel} />
        <Button
          label="Teklif iste"
          disabled={!canSubmitRfq}
          accessibilityLabel={`Teklif iste, ${selection.companyCount} firma`}
          onPress={() => navigation.navigate('RfqForm', { items: selection.items })}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  ) : null;

  // İplik dizini kısayolu: kapsam çipi "İplik" iken aynı ekranın içinde açılır.
  if (domain === 'iplik') {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {appBar}
        <View style={{ paddingTop: t.space[3] }}>{scopeChips}</View>
        <View style={{ flex: 1 }}>
          <YarnDirectory
            onOpenProduct={(id) => navigation.navigate('ProductDetail', { productId: id })}
            onAddYarn={user?.companyId ? () => navigation.navigate('YarnForm') : undefined}
            onRfqSubmit={(items) => navigation.navigate('RfqForm', { items })}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      {appBar}
      <Screen scroll={false} noPadding contentStyle={{ gap: t.space[3] }} sticky={rfqBar}>
        {searchBox}
        {scopeChips}
        {typeChips}
        {subtypeChips}
        {usageChips}
        {filterChips}
        {selection.active
          ? notice('Teklif almak istediğiniz ürünleri işaretleyin; her firmaya tek istek gider.', 'info')
          : null}
        {watchNote ? notice(watchNote.text, watchNote.tone) : null}
        {offline ? notice('Sunucuya ulaşılamadı, örnek veriler gösteriliyor.', 'error') : null}
        {resultBar}
        {loading && products.length === 0 ? (
          skeleton
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={visibleProducts}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            refreshControl={refresh}
            contentContainerStyle={{ gap: t.space[3], paddingBottom: t.space[10] }}
            ListHeaderComponent={companiesHeader}
            ListEmptyComponent={emptyState}
            renderItem={({ item }) => (
              <CatalogCard
                product={item}
                selection={selection}
                canSelect={!!user && user.companyId !== item.companyId}
                onOpen={() => navigation.navigate('ProductDetail', { productId: item.id })}
              />
            )}
          />
        )}
      </Screen>

      <BottomSheet visible={sortOpen} onClose={() => setSortOpen(false)} title="Sıralama">
        {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
          <Pressable
            key={key}
            onPress={() => {
              haptics.selection();
              setSort(key);
              setSortOpen(false);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: sort === key }}
            style={({ pressed }) => ({
              minHeight: t.size.touchMin,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: t.space[3],
              borderRadius: t.radius.md,
              backgroundColor: pressed ? t.colors.surface2 : 'transparent',
            })}
          >
            <Text style={[t.type.body16, { color: t.colors.ink }]}>{SORT_LABELS[key]}</Text>
            {sort === key ? <Icon name="check" size={t.size.iconSm} color="brand" /> : null}
          </Pressable>
        ))}
      </BottomSheet>
    </View>
  );
}

// Liste öğesi: ProductCard + seçim kipi. Fotoğraf hook'u kart başına çalıştığı
// için ayrı bileşen (hook koşullu çağrılamaz).
function CatalogCard({
  product,
  selection,
  canSelect,
  onOpen,
}: {
  product: Product;
  selection: ReturnType<typeof useRfqSelection>;
  // Kendi firmanızın ürününe teklif istenmez.
  canSelect: boolean;
  onOpen: () => void;
}) {
  const t = useTheme();
  const imageUri = useProductImage(product.id, product.hasImage);
  const selectable = selection.active && canSelect;
  const selected = selection.selectedIds.has(product.id);

  const card = (
    <ProductCard
      name={categoryLabel(product.type, product.subtype ?? '')}
      code={product.code}
      specs={specsOf(product)}
      companyName={product.company?.name}
      companyVerified={product.company?.verification === 'dogrulanmis'}
      imageUri={imageUri}
      onPress={() => {
        if (!selectable) {
          onOpen();
          return;
        }
        haptics.selection();
        selection.toggle(toSelectionItem(product));
      }}
      style={[
        { marginHorizontal: t.space[4] },
        selectable && selected ? { borderColor: t.colors.brand, backgroundColor: t.colors.brandSoft } : null,
      ]}
    />
  );

  if (!selectable) return card;
  return (
    <View accessibilityState={{ checked: selected }} style={{ minWidth: 0 }}>
      {card}
    </View>
  );
}

// Ürün satırından forma taşınan özet.
export function toSelectionItem(product: Product): RfqSelectionItem {
  return {
    id: product.id,
    code: product.code,
    companyId: product.companyId,
    companyName: product.company?.name ?? 'Firma',
    stockUnit: product.stockUnit,
    type: product.type,
  };
}
