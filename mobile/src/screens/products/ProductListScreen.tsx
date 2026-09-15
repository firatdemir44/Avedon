import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TextInput, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { MainTabScreenProps } from '../../navigation/types';
import { fetchProducts, searchCompanies } from '../../api/client';
import { mockProducts } from '../../data/mockProducts';
import { useSession } from '../../context/SessionContext';
import { ProductThumbnail } from '../../components/ProductThumbnail';
import { Badge } from '../../components/Badge';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import type { Company, Product } from '../../types';
import { MIN_TOUCH, colors, fonts, radius, shadow, spacing, typography } from '../../theme';

type Props = MainTabScreenProps<'ProductList'>;

const TYPE_LABELS: Record<Product['type'], string> = {
  raschel: 'Raschel',
  orme: 'Örme',
  dokuma: 'Dokuma',
  diger: 'Diğer',
};

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
                [p.code, p.content, p.useArea, TYPE_LABELS[p.type]].join(' ').toLowerCase().includes(q)
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
      <View style={styles.header}>
        <TextInput
          style={styles.search}
          placeholder="İçerik, gramaj, kullanım alanı ara..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
        />
        {/* Hesaplama araçları Hesaplamalar sekmesine, AI Danışman ana ekrana,
            gezinme hedefleri sekmelere ve Profil menüsüne taşındı — burada
            sadece katalogla doğrudan ilgili kısayol kalıyor. */}
        <View style={styles.menuRow}>
          {user?.companyId ? (
            <Pressable onPress={() => navigation.navigate('CompanyProfile')} style={styles.menuChip}>
              <Text style={styles.menuChipText}>Firmam</Text>
            </Pressable>
          ) : null}
        </View>
        {offline ? <Text style={styles.offlineNotice}>API'ye ulaşılamadı, örnek veriler gösteriliyor</Text> : null}
      </View>
      {loading && products.length === 0 ? (
        <SkeletonList variant="product" style={styles.skeleton} />
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
            <View style={styles.companySection}>
              <Text style={styles.sectionTitle}>Firmalar</Text>
              {companies.map((c) => (
                <Pressable
                  key={c.id}
                  style={styles.companyRow}
                  onPress={() => navigation.navigate('CompanyProfile', { companyId: c.id })}
                >
                  <Text style={styles.companyRowText}>{c.name}</Text>
                </Pressable>
              ))}
              <Text style={styles.sectionTitle}>Ürünler</Text>
            </View>
          ) : null
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
        renderItem={({ item }) => (
          // Kartın tamamı (fotoğraf dahil) ürün sayfasını açıyor; fotoğraf
          // orada tam genişlikte ve dokununca tam ekran büyüyor.
          <Pressable
            style={styles.card}
            onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
          >
            <ProductThumbnail productId={item.id} hasImage={item.hasImage} />
            <View style={styles.cardBody}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.code}>{item.code}</Text>
                <Badge label={TYPE_LABELS[item.type]} tone="outline" />
              </View>
              {item.company ? <Text style={styles.company}>{item.company.name}</Text> : null}
              <Text style={styles.content}>{item.content}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.meta}>{item.weightGsm} gr/m²</Text>
                <Text style={styles.meta}>{item.widthCm} cm en</Text>
                <Text style={styles.meta}>{item.stock} m stok</Text>
              </View>
              <Text style={styles.useArea}>{item.useArea}</Text>
              {user ? (
                <Pressable
                  style={styles.sampleButton}
                  onPress={() => navigation.navigate('SampleRequestForm', { productId: item.id, productCode: item.code })}
                >
                  <Text style={styles.sampleButtonText}>Numune Talep Et</Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        )}
      />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  menuRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  menuChip: {
    minHeight: MIN_TOUCH - 8,
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  menuChipText: {
    ...typography.label,
    color: colors.primary,
  },
  search: {
    fontFamily: fonts.regular,
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 4,
    fontSize: 15,
    backgroundColor: colors.surfaceTonal,
    color: colors.text,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  code: {
    ...typography.subtitle,
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  company: {
    ...typography.label,
    color: colors.accent,
    marginBottom: spacing.xs,
  },
  content: {
    ...typography.body,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  useArea: {
    ...typography.caption,
    color: colors.textMuted,
  },
  sampleButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    minHeight: MIN_TOUCH - 8,
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm,
  },
  sampleButtonText: {
    ...typography.label,
    color: colors.primaryText,
  },
  companySection: {
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  companyRow: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  companyRowText: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  // Arama kutusu zaten üstte boşluk bırakıyor; iskelet listeyle aynı hizada başlasın.
  skeleton: { paddingTop: 0 },
  offlineNotice: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.xs,
  },
});
