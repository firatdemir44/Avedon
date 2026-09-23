// "Takip ettiklerim" — yeni tasarım (DESIGN.md §2/§3). Veri katmanı aynı:
// fetchFavoriteProducts + teklif seçim kipi (useRfqSelection). Görünüm:
// AppBar · seçim kipi düğmesi · ProductCard listesi · yapışkan teklif şeridi.
// Ham hex / ham px yok: her değer useTheme() token'ı ya da src/ui bileşeni.
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { fetchFavoriteProducts } from '../../api/client';
import { useSession } from '../../context/SessionContext';
import { useFocusLoad } from '../../features/useFocusLoad';
import { friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useRfqSelection, type RfqSelection } from '../../features/quotes/rfqSelection';
import { haptics } from '../../features/haptics';
import { formatMeasure } from '../../features/calculators/parse';
import { categoryLabel, isYarnType } from '../../features/products/catalog';
import { formatComposition } from '../../features/products/glossaryLabels';
import { getCachedProductImage, loadProductImage } from '../../features/products/productImageCache';
import type { Product } from '../../types';
import { toSelectionItem } from './ProductListScreen';
import { useTheme } from '../../theme/ThemeContext';
import { useBottomPadding, AppBar, Button, EmptyState, Icon, ProductCard, Screen, SkeletonRow } from '../../ui';

type Props = RootStackScreenProps<'FavoriteProducts'>;

// --- Liste ekranlarının ortak yardımcıları (Son baktıklarım, Fotoğrafla ara,
// İplik dizini de bunları kullanır). ProductListScreen'deki kalıbın aynısı.

/** "165 gr/m² · 160 cm · %94 PES %6 EA" — iplikte özet satırı. */
export function productSpecs(product: Product): string {
  if (isYarnType(product.type)) return product.yarn?.summary || product.content;
  const composition = product.composition ?? [];
  const content = composition.length ? formatComposition(composition) : product.content;
  return [`${formatMeasure(product.weightGsm)} gr/m²`, `${formatMeasure(product.widthCm)} cm`, content]
    .filter(Boolean)
    .join(' · ');
}

/** Kapak fotoğrafı liste yanıtında gelmiyor; önbellekten / tek tek çekilir. */
export function useProductImage(productId: string, hasImage: boolean) {
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

/** Ürün kartı + teklif seçim kipi (kart başına fotoğraf hook'u). */
export function SelectableProductCard({
  product,
  selection,
  canSelect,
  onOpen,
}: {
  product: Product;
  selection: RfqSelection;
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
      specs={productSpecs(product)}
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
      style={selectable && selected ? { borderColor: t.colors.brand, backgroundColor: t.colors.brandSoft } : undefined}
    />
  );

  if (!selectable) return card;
  return (
    <View accessibilityState={{ checked: selected }} style={{ minWidth: 0 }}>
      {card}
    </View>
  );
}

/** Teklif seçim şeridi: Screen'in `sticky` alanına konur (ProductListScreen kalıbı). */
export function RfqStickyBar({ selection, onSubmit }: { selection: RfqSelection; onSubmit: () => void }) {
  const t = useTheme();
  const canSubmit = selection.companyCount >= 2;
  return (
    <View style={{ gap: t.space[2] }}>
      <Text style={[t.type.label14, { color: t.colors.ink }]}>
        {selection.items.length} ürün · {selection.companyCount} firma seçildi
      </Text>
      {!canSubmit ? (
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
          disabled={!canSubmit}
          accessibilityLabel={`Teklif iste, ${selection.companyCount} firma`}
          onPress={onSubmit}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

/** Hata şeridi (RequestsScreen'deki `banner` kalıbı). */
export function ErrorBanner({ message }: { message: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space[2],
        padding: t.space[3],
        borderRadius: t.radius.md,
        backgroundColor: t.colors.dangerSoft,
      }}
    >
      <Icon name="warning" size={t.size.iconSm} color="danger" />
      <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{message}</Text>
    </View>
  );
}

// "Takip Ettiklerim" (Faz 1 Adım 6'ya kadar "Favorilerim"; kayıt yine
// ProductFavorite, yalnızca etiket değişti). Ürün sayfasındaki ya da akış
// kartındaki "Takibe al" ile eklenir; ekrana her dönüşte yenilenir.
// Faz 3, Adım 1: ürün listesindeki "Teklif için seç" kipi burada da var —
// takip edilenler zaten karşılaştırılacak kısa listedir.
export function FavoriteProductsScreen({ navigation }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const { user } = useSession();
  const selection = useRfqSelection();
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchFavoriteProducts().then(({ products }) => products)
  );

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const appBar = <AppBar title="Takip ettiklerim" leading="back" onBack={() => navigation.goBack()} />;

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
          <ErrorBanner message={friendlyMessage(error, 'Takip edilenler alınamadı')} />
          <Button kind="secondary" label="Tekrar dene" onPress={reload} />
        </Screen>
      </View>
    );
  }

  const header = (
    <View style={{ gap: t.space[3], paddingBottom: t.space[3] }}>
      {user && data.length > 1 ? (
        <Button
          kind="secondary"
          icon={selection.active ? 'x' : 'checkbox-outline'}
          label={selection.active ? 'Seçimi bırak' : 'Teklif için seç'}
          accessibilityLabel={
            selection.active ? 'Teklif için seçmeyi bırak' : 'Teklif için ürün seç, birkaç firmaya birden sor'
          }
          onPress={() => {
            haptics.selection();
            if (selection.active) selection.cancel();
            else selection.start();
          }}
        />
      ) : null}
      {selection.active ? (
        <Text style={[t.type.body14, { color: t.colors.ink2 }]} accessibilityLiveRegion="polite">
          Teklif almak istediğiniz ürünleri işaretleyin; her firmaya tek istek gider.
        </Text>
      ) : null}
      {data.length ? (
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{data.length} takip edilen kumaş</Text>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      {appBar}
      <Screen
        scroll={false}
        sticky={
          selection.active ? (
            <RfqStickyBar
              selection={selection}
              onSubmit={() => navigation.navigate('RfqForm', { items: selection.items })}
            />
          ) : undefined
        }
      >
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: t.space[3], paddingBottom: bottomPad }}
          refreshControl={refreshControl(refreshing, refresh)}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState
              icon="heart"
              title="Takip ettiğin kumaşları burada topla"
              description="Ürün sayfasındaki ya da akış kartındaki Takibe al düğmesiyle ilgilendiğin kumaşlar burada listelenir."
              actionLabel="Ürünlere göz at"
              onAction={() => navigation.navigate('MainTabs', { screen: 'ProductList' })}
            />
          }
          renderItem={({ item }) => (
            <SelectableProductCard
              product={item}
              selection={selection}
              canSelect={!!user && user.companyId !== item.companyId}
              onOpen={() => navigation.navigate('ProductDetail', { productId: item.id })}
            />
          )}
        />
      </Screen>
    </View>
  );
}
