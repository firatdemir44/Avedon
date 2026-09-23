// "Son baktıklarım" — yeni tasarım (DESIGN.md §2/§3). Veri katmanı aynı:
// fetchRecentlyViewedProducts (güne göre gruplu, en yeni üstte) +
// clearRecentlyViewedProducts. Görünüm: AppBar · gün başlıkları (SectionTitle)
// · ProductCard listesi · altta kenarlıklı "Geçmişi temizle".
// Ham hex / ham px yok: her değer useTheme() token'ı ya da src/ui bileşeni.
import React, { useLayoutEffect, useMemo, useState } from 'react';
import { SectionList, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { clearRecentlyViewedProducts, fetchRecentlyViewedProducts, type RecentlyViewedProduct } from '../../api/client';
import { useFocusLoad } from '../../features/useFocusLoad';
import { formatDayLabel } from '../../features/time';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useTheme } from '../../theme/ThemeContext';
import { useBottomPadding, AppBar, Button, EmptyState, ProductCard, Screen, SectionTitle, SkeletonRow } from '../../ui';
import { categoryLabel } from '../../features/products/catalog';
import { ErrorBanner, productSpecs, useProductImage } from './FavoriteProductsScreen';

type Props = RootStackScreenProps<'RecentlyViewedProducts'>;

// Kart başına fotoğraf hook'u (hook koşullu/döngüde çağrılamaz).
function ViewedCard({ product, onOpen }: { product: RecentlyViewedProduct; onOpen: () => void }) {
  const imageUri = useProductImage(product.id, product.hasImage);
  return (
    <ProductCard
      name={categoryLabel(product.type, product.subtype ?? '')}
      code={product.code}
      specs={productSpecs(product)}
      companyName={product.company?.name}
      companyVerified={product.company?.verification === 'dogrulanmis'}
      imageUri={imageUri}
      onPress={onOpen}
    />
  );
}

// Orijinal tasarımdaki "Son Bakılan Ürünler" (Avedon Geçmişi): güne göre
// gruplu, en son bakılan üstte. Kayıt sunucuda (her cihazda aynı); kendi
// firmanın ürünleri tutulmuyor.
export function RecentlyViewedProductsScreen({ navigation }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const { data, setData, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchRecentlyViewedProducts().then(({ products }) => products)
  );
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState(false);

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const sections = useMemo(() => {
    const groups: { title: string; data: RecentlyViewedProduct[] }[] = [];
    for (const product of data ?? []) {
      const title = formatDayLabel(product.viewedAt);
      const last = groups[groups.length - 1];
      if (last && last.title === title) last.data.push(product);
      else groups.push({ title, data: [product] });
    }
    return groups;
  }, [data]);

  const clearHistory = async () => {
    const confirmed = await confirmAction({
      title: 'Geçmişi temizle',
      message: 'Son baktığınız ürünlerin listesi silinsin mi?',
      confirmLabel: 'Temizle',
      destructive: true,
    });
    if (!confirmed) return;
    setClearing(true);
    setClearError(false);
    try {
      await clearRecentlyViewedProducts();
      haptics.success();
      setData([]);
    } catch {
      haptics.error();
      setClearError(true);
    } finally {
      setClearing(false);
    }
  };

  const appBar = <AppBar title="Son baktıklarım" leading="back" onBack={() => navigation.goBack()} />;

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {appBar}
        <Screen contentStyle={{ gap: t.space[3] }}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </Screen>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {appBar}
        <Screen>
          <ErrorBanner message={friendlyMessage(error, 'Son baktıklarınız alınamadı')} />
          <Button kind="secondary" label="Tekrar dene" onPress={reload} />
        </Screen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      {appBar}
      <Screen scroll={false}>
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: bottomPad }}
          refreshControl={refreshControl(refreshing, refresh)}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={{ paddingTop: section === sections[0] ? 0 : t.space[6], paddingBottom: t.space[3] }}>
              <SectionTitle title={`${section.title} · ${section.data.length}`} />
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: t.space[3] }} />}
          ListEmptyComponent={
            <EmptyState
              icon="clock"
              title="Baktığın ürünleri burada bul"
              description="Açtığın ürünler burada gün gün listelenir. Kendi firmanın ürünleri eklenmez."
              actionLabel="Ürünlere göz at"
              onAction={() => navigation.navigate('MainTabs', { screen: 'ProductList' })}
            />
          }
          ListFooterComponent={
            data.length > 0 ? (
              <View style={{ paddingTop: t.space[6], gap: t.space[3] }}>
                {clearError ? <ErrorBanner message="Geçmiş temizlenemedi, tekrar deneyin." /> : null}
                <Button
                  kind="danger"
                  fullWidth
                  label="Geçmişi temizle"
                  loading={clearing}
                  onPress={() => void clearHistory()}
                />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <ViewedCard product={item} onOpen={() => navigation.navigate('ProductDetail', { productId: item.id })} />
          )}
        />
      </Screen>
    </View>
  );
}
