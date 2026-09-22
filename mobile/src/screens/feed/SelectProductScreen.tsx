// Gönderiye eklenecek ürünü seçme ekranı (yeni tasarım, 4. adım — DESIGN.md §2–3).
// Veri katmanı değişmedi: aynı uç, aynı arama, aynı `popTo` dönüşü. Sunum
// yenilendi: AppBar + ui/SearchBox + ui/ProductCard + ui/EmptyState.
//
// Kullanıcı geri bildirimi (2026-09-16): firmaların yüzlerce kumaşı olacak,
// hepsini gönderi ekranında listelemek ekranı kullanılmaz hale getirir. Arama
// sunucuda yapılıyor; tek seferde ilk 30 ürün geliyor, gerisine aramayla ulaşılıyor.
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { fetchMyProducts, type MyProductOption } from '../../api/client';
import { getCachedProductImage, loadProductImage } from '../../features/products/productImageCache';
import { categoryLabel } from '../../features/products/catalog';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import {
  AppBar,
  Button,
  EmptyState,
  ProductCard,
  Screen,
  SearchBox,
  SectionTitle,
  SkeletonRow,
} from '../../ui';

type Props = RootStackScreenProps<'SelectProduct'>;

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 300;

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

export function SelectProductScreen({ navigation, route }: Props) {
  const t = useTheme();
  const selectedId = route.params?.selectedId ?? null;
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<MyProductOption[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

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
    }, SEARCH_DEBOUNCE_MS);
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

  const header = (
    <View style={{ gap: t.space[3], paddingBottom: t.space[3] }}>
      <SearchBox
        value={query}
        onChangeText={setQuery}
        placeholder="Ürün kodu, içerik, çeşit ara"
        accessibilityLabel="Kendi ürünlerimde ara"
      />
      {products.length > 0 ? (
        <SectionTitle
          title={`${searching ? 'Arama sonuçları' : 'Ürünlerim'} · ${searching ? products.length : total}`}
        />
      ) : null}
    </View>
  );

  const empty = failed ? (
    <EmptyState
      icon="warning"
      title="Ürünler alınamadı"
      description="Bağlantınızı kontrol edip tekrar deneyin."
    />
  ) : searching ? (
    <EmptyState
      icon="search"
      title="Sonuç bulunamadı"
      description={`"${query.trim()}" ile eşleşen ürününüz yok.`}
      actionLabel="Aramayı temizle"
      onAction={() => setQuery('')}
    />
  ) : (
    <EmptyState
      icon="fabric"
      title="Firmanızın ürünü yok"
      description="Önce bir ürün kartı ekleyin, sonra gönderilerinizde paylaşabilirsiniz."
      actionLabel="Ürün ekle"
      onAction={() => navigation.navigate('AddProduct')}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title="Ürün seç" leading="back" onBack={() => navigation.goBack()} />
      <Screen
        scroll={false}
        noPadding
        sticky={
          products.length > 0 ? (
            <Button
              kind="secondary"
              size="lg"
              label="Yeni ürün ekle"
              icon="plus"
              onPress={() => navigation.navigate('AddProduct')}
            />
          ) : undefined
        }
      >
        {loading && products.length === 0 ? (
          <View style={{ paddingHorizontal: t.space[4], gap: t.space[4] }}>
            {header}
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : (
          <FlatList
            data={products}
            keyExtractor={(item) => item.id}
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: t.space[4],
              paddingBottom: t.space[10],
              gap: t.space[3],
            }}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={header}
            ListEmptyComponent={empty}
            ListFooterComponent={
              !searching && total > products.length ? (
                <Text style={[t.type.body14, { color: t.colors.ink2, paddingTop: t.space[3] }]}>
                  {total} üründen ilk {products.length} tanesi gösteriliyor. Aradığınızı bulmak için yukarıdan
                  arayın.
                </Text>
              ) : null
            }
            renderItem={({ item }) => (
              <SelectableProductCard
                product={item}
                selected={item.id === selectedId}
                onSelect={() => select(item)}
              />
            )}
          />
        )}
      </Screen>
    </View>
  );
}

// Fotoğraf hook'u kart başına çalıştığı için ayrı bileşen (hook koşullu çağrılamaz).
function SelectableProductCard({
  product,
  selected,
  onSelect,
}: {
  product: MyProductOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTheme();
  const imageUri = useProductImage(product.id, product.hasImage);
  const name = categoryLabel(product.type, product.subtype ?? '');
  return (
    <ProductCard
      name={name}
      code={product.code}
      specs={selected ? 'Gönderiye eklenmiş ürün' : undefined}
      imageUri={imageUri}
      onPress={onSelect}
      style={selected ? { borderColor: t.colors.brand, backgroundColor: t.colors.brandSoft } : undefined}
    />
  );
}
