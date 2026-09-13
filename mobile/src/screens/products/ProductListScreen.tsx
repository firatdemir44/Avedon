import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { fetchProducts, searchCompanies } from '../../api/client';
import { mockProducts } from '../../data/mockProducts';
import { useSession } from '../../context/SessionContext';
import { ProductThumbnail } from '../../components/ProductThumbnail';
import type { Company, Product } from '../../types';
import { colors, radius, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ProductList'>;

const TYPE_LABELS: Record<Product['type'], string> = {
  raschel: 'Raschel',
  orme: 'Örme',
  dokuma: 'Dokuma',
  diger: 'Diğer',
};

export function ProductListScreen({ navigation }: Props) {
  const { user, logout } = useSession();
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const queryRef = useRef(query);
  queryRef.current = query;

  const loadProducts = useCallback((search: string, signal: { cancelled: boolean }) => {
    setLoading(true);
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
        if (!signal.cancelled) setLoading(false);
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
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Ürünler</Text>
          {user ? (
            <Pressable
              onPress={() => {
                logout();
                navigation.reset({ index: 0, routes: [{ name: 'RoleSelection' }] });
              }}
            >
              <Text style={styles.logoutLink}>Çıkış</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.menuRow}>
          <Pressable onPress={() => navigation.navigate('Advisor')} style={styles.menuChip}>
            <Text style={styles.menuChipText}>AI Danışman</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('CalculatorsList')} style={styles.menuChip}>
            <Text style={styles.menuChipText}>Hesap Araçları</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('GarmentVisualCost')} style={styles.menuChip}>
            <Text style={styles.menuChipText}>Görsel Maliyet</Text>
          </Pressable>
          {user ? (
            <Pressable onPress={() => navigation.navigate('MySampleRequests')} style={styles.menuChip}>
              <Text style={styles.menuChipText}>Taleplerim</Text>
            </Pressable>
          ) : null}
          {user?.companyId ? (
            <Pressable onPress={() => navigation.navigate('CompanyProfile')} style={styles.menuChip}>
              <Text style={styles.menuChipText}>Firmam</Text>
            </Pressable>
          ) : null}
          {user?.isAdmin ? (
            <Pressable onPress={() => navigation.navigate('Admin')} style={styles.menuChip}>
              <Text style={styles.menuChipText}>Admin</Text>
            </Pressable>
          ) : null}
        </View>
        <TextInput
          style={styles.search}
          placeholder="İçerik, gramaj, kullanım alanı ara..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
        />
        {offline ? <Text style={styles.offlineNotice}>API'ye ulaşılamadı, örnek veriler gösteriliyor</Text> : null}
      </View>
      {loading && products.length === 0 ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
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
        ListEmptyComponent={<Text style={styles.empty}>Sonuç bulunamadı</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <ProductThumbnail imageUrl={item.imageUrl} />
            <View style={styles.cardBody}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.code}>{item.code}</Text>
                <Text style={styles.typeBadge}>{TYPE_LABELS[item.type]}</Text>
              </View>
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
          </View>
        )}
      />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
  },
  logoutLink: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  menuRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  menuChip: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  menuChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    fontSize: 15,
    backgroundColor: colors.surface,
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
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
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  typeBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  content: {
    fontSize: 14,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  meta: {
    fontSize: 13,
    color: colors.textMuted,
  },
  useArea: {
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  sampleButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  sampleButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  companySection: {
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  companyRow: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  companyRowText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.xl,
  },
  offlineNotice: {
    fontSize: 12,
    color: colors.danger,
    marginTop: spacing.xs,
  },
});
