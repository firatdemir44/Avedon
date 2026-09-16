import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import { fetchMyProducts, type MyProductOption } from '../../api/client';
import { ProductThumbnail } from '../../components/ProductThumbnail';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SearchField } from '../../components/SearchField';
import { SectionHeader } from '../../components/SectionHeader';
import { EmptyState } from '../../components/StateView';
import { categoryLabel } from '../../features/products/catalog';
import { haptics } from '../../features/haptics';
import { colors, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'SelectProduct'>;

// Gönderiye eklenecek ürünü seçme ekranı. Kullanıcı geri bildirimi (2026-09-16):
// firmaların yüzlerce kumaşı olacak, hepsini gönderi ekranında listelemek
// ekranı kullanılmaz hale getirir. Arama sunucuda yapılıyor; tek seferde ilk
// 30 ürün geliyor, gerisine aramayla ulaşılıyor.
const PAGE_SIZE = 30;

export function SelectProductScreen({ navigation, route }: Props) {
  const selectedId = route.params?.selectedId ?? null;
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<MyProductOption[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const signal = { cancelled: false };
    setLoading(true);
    const timer = setTimeout(() => {
      fetchMyProducts(query, PAGE_SIZE)
        .then(({ products: fetched, total: count }) => {
          if (signal.cancelled) return;
          setProducts(fetched);
          setTotal(count);
          setFailed(false);
        })
        .catch(() => {
          if (signal.cancelled) return;
          setProducts([]);
          setFailed(true);
        })
        .finally(() => {
          if (!signal.cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      signal.cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // Seçim gönderi ekranına geri dönüyor; o ekran ayakta kaldığı için yazılan
  // metin ve eklenen fotoğraf korunuyor (merge: true).
  const select = (product: MyProductOption) => {
    haptics.selection();
    // popTo: React Navigation 7'de navigate geri gitmez, CreatePost'un ikinci
    // kopyasını açar.
    navigation.popTo('CreatePost', { productId: product.id, pickedAt: Date.now() }, { merge: true });
  };

  const searching = !!query.trim();

  return (
    <View style={styles.screen}>
      <View style={styles.searchBar}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Ürün kodu, içerik, çeşit ara"
          accessibilityLabel="Kendi ürünlerimde ara"
        />
      </View>

      {loading && products.length === 0 ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            products.length > 0 ? (
              <SectionHeader
                title={searching ? 'Arama sonuçları' : 'Ürünlerim'}
                count={searching ? products.length : total}
                first
              />
            ) : null
          }
          ListFooterComponent={
            !searching && total > products.length ? (
              <Text style={styles.footerNote}>
                {total} üründen ilk {products.length} tanesi gösteriliyor. Aradığınızı bulmak için yukarıdan arayın.
              </Text>
            ) : null
          }
          ListEmptyComponent={
            failed ? (
              <EmptyState
                icon="cloud-offline-outline"
                title="Ürünler alınamadı"
                message="Bağlantınızı kontrol edip tekrar deneyin."
              />
            ) : searching ? (
              <EmptyState
                icon="search-outline"
                title="Sonuç bulunamadı"
                message={`"${query.trim()}" ile eşleşen ürününüz yok.`}
                actionLabel="Aramayı temizle"
                onAction={() => setQuery('')}
              />
            ) : (
              <EmptyState
                icon="cube-outline"
                title="Firmanızın ürünü yok"
                message="Önce bir ürün kartı ekleyin, sonra gönderilerinizde paylaşabilirsiniz."
                actionLabel="Ürün Ekle"
                onAction={() => navigation.navigate('AddProduct')}
              />
            )
          }
          renderItem={({ item, index }) => {
            const selected = item.id === selectedId;
            return (
              <Pressable
                onPress={() => select(item)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${item.code}, ${categoryLabel(item.type, item.subtype ?? '')}${selected ? ', seçili' : ''}`}
                android_ripple={{ color: colors.pressed }}
                style={({ pressed }) => [
                  styles.row,
                  index < products.length - 1 && styles.divider,
                  selected && styles.rowSelected,
                  pressed && !selected && styles.rowPressed,
                ]}
              >
                <ProductThumbnail productId={item.id} hasImage={item.hasImage} size={44} />
                <View style={styles.texts}>
                  <Text style={styles.code}>{item.code}</Text>
                  <Text style={styles.meta}>{categoryLabel(item.type, item.subtype ?? '')}</Text>
                </View>
                {selected ? <Ionicons name="checkmark-circle" size={24} color={colors.primary} /> : null}
              </Pressable>
            );
          }}
        />
      )}

      {products.length > 0 ? (
        <View style={styles.actionBar}>
          <PrimaryButton
            label="Yeni Ürün Ekle"
            icon="add"
            variant="outline"
            size="lg"
            onPress={() => navigation.navigate('AddProduct')}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  searchBar: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  loading: { marginTop: spacing.xl },
  list: { paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowSelected: { backgroundColor: colors.accentSoft },
  rowPressed: { backgroundColor: colors.pressed },
  texts: { flex: 1, gap: 1 },
  code: { ...typography.monoStrong, color: colors.primary },
  meta: { ...typography.caption, color: colors.textMuted },
  footerNote: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
  },
  actionBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.gutter,
    paddingVertical: 10,
  },
});
