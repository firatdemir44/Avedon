// "Fotoğrafla kumaş ara" — yeni tasarım (DESIGN.md §2/§3). Veri katmanı aynı:
// pickLookPhoto + searchSimilarByPhoto. Görünüm: AppBar · giriş kartı (Card)
// · fotoğraf önizleme · ProductCard sonuç listesi (altında benzerlik rozeti +
// nedenler) · kenarlıklı "Başka fotoğrafla ara".
// Ekranda tek dolu düğme: "Fotoğraf çek" (web'de "Galeriden seç").
// Ham hex / ham px yok: her değer useTheme() token'ı ya da src/ui bileşeni.
import React, { useLayoutEffect, useState } from 'react';
import { Image, Platform, Text, View } from 'react-native';
import {
  ApiError,
  MAX_LOOK_IMAGE_CHARS,
  searchSimilarByPhoto,
  type LookSearchResult,
  type SimilarProductResult,
} from '../../api/client';
import { pickLookPhoto } from '../../features/imagePicker';
import { haptics } from '../../features/haptics';
import { categoryLabel } from '../../features/products/catalog';
import type { RootStackScreenProps } from '../../navigation/types';
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Badge, Button, Card, EmptyState, Icon, ProductCard, Screen, SectionTitle, SkeletonRow } from '../../ui';
import { ErrorBanner, productSpecs, useProductImage } from './FavoriteProductsScreen';

type Props = RootStackScreenProps<'SimilarSearch'>;

// Faz 3, Adım 3: "Fotoğrafla benzerini bul". Sunucu yalnızca GÖRÜNÜMÜ
// karşılaştırır (desen, renk, yüzey, doku); gramaj ve içerik fotoğraftan
// okunmaz — bu sınır ekranda açıkça yazılı, sonuçların üstünde durur.
const HONESTY_NOTE =
  'Yalnızca görünüm karşılaştırılır. Gramaj ve içerik fotoğraftan okunamaz; ürün sayfasından kontrol edin.';

// Önizleme karesi (DESIGN.md'de adı olmayan ekran-içi ölçü).
const PREVIEW_SIZE = 72;

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'daily_limit') return 'Günlük 20 arama sınırına ulaştınız, yarın tekrar deneyin.';
    if (err.code === 'llm_not_configured') return 'Görsel arama şu anda kapalı. Daha sonra tekrar deneyin.';
    if (err.code === 'look_failed') return 'Fotoğraf incelenemedi. Lütfen tekrar deneyin.';
    if (err.code === 'unsupported_image' || err.code === 'invalid_body')
      return 'Bu fotoğraf kullanılamadı. Başka bir fotoğrafla deneyin.';
    if (err.status === 401) return 'Bu arama için giriş yapmanız gerekiyor.';
    return err.message;
  }
  if (err instanceof Error) {
    if (err.message === 'camera_permission_denied') return 'Kameraya erişim izni verilmedi.';
    if (err.message === 'permission_denied') return 'Galeriye erişim izni verilmedi.';
    if (err.message === 'image_too_large')
      return 'Fotoğraf çok büyük. Daha küçük çözünürlükte bir fotoğrafla deneyin.';
  }
  return 'Arama yapılamadı, lütfen tekrar deneyin.';
}

export function SimilarSearchScreen({ navigation }: Props) {
  const t = useTheme();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<LookSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const start = async (source: 'camera' | 'gallery') => {
    setError(null);
    let picked;
    try {
      picked = await pickLookPhoto(source, MAX_LOOK_IMAGE_CHARS);
    } catch (err) {
      setError(errorMessage(err));
      return;
    }
    if (!picked) return;

    setPhotoUri(picked.uri);
    setResult(null);
    setSearching(true);
    try {
      const found = await searchSimilarByPhoto(picked.dataUrl);
      setResult(found);
      haptics.success();
    } catch (err) {
      haptics.error();
      setError(errorMessage(err));
    } finally {
      setSearching(false);
    }
  };

  const reset = () => {
    setPhotoUri(null);
    setResult(null);
    setError(null);
  };

  // Kamera yalnızca telefonda; web'de tarayıcı kamerası yok, dosya seçici tek
  // (ve dolu) düğme olarak kalır.
  const hasCamera = Platform.OS !== 'web';
  const pickers = (
    <View style={{ gap: t.space[2] }}>
      {hasCamera ? <Button size="lg" icon="camera" label="Fotoğraf çek" onPress={() => start('camera')} /> : null}
      <Button
        size="lg"
        kind={hasCamera ? 'secondary' : 'primary'}
        icon="images-outline"
        label="Galeriden seç"
        onPress={() => start('gallery')}
      />
    </View>
  );

  const note = (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.space[2], minWidth: 0 }}>
      <Icon name="info" size={t.size.iconSm} color="ink3" />
      <Text style={[t.type.body14, { color: t.colors.ink2, flex: 1, minWidth: 0 }]}>{HONESTY_NOTE}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title="Fotoğrafla kumaş ara" leading="back" onBack={() => navigation.goBack()} />
      <Screen>
        {!photoUri && !searching ? (
          <Card style={{ gap: t.space[3] }}>
            <Text style={[t.type.title18, { color: t.colors.ink }]}>Elindeki kumaşın benzerini bul</Text>
            <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
              Kumaşı düz bir zeminde, yakından ve iyi ışıkta çek. Platformdaki ürünlerin fotoğraflarıyla
              görünüm olarak karşılaştırılır.
            </Text>
            {pickers}
            {note}
          </Card>
        ) : null}

        {photoUri ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
            <Image
              source={{ uri: photoUri }}
              accessibilityLabel="Aranan fotoğraf"
              style={{
                width: PREVIEW_SIZE,
                height: PREVIEW_SIZE,
                borderRadius: t.radius.sm,
                borderWidth: 1,
                borderColor: t.colors.line,
                backgroundColor: t.colors.surface2,
              }}
            />
            <View style={{ flex: 1, minWidth: 0, gap: t.space[1] / 2 }}>
              {searching ? (
                <>
                  <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>Kumaşın görünümü inceleniyor</Text>
                  <Text style={[t.type.body14, { color: t.colors.ink2 }]}>Birkaç saniye sürebilir.</Text>
                </>
              ) : result ? (
                <>
                  <Text style={[t.type.body16Strong, { color: t.colors.ink }]} numberOfLines={3}>
                    Gördüğümüz: {result.look.summary}
                  </Text>
                  {result.remaining <= 5 ? (
                    <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                      Bugün {result.remaining} arama hakkınız kaldı
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>Seçilen fotoğraf</Text>
              )}
            </View>
          </Card>
        ) : null}

        {/* Yükleme: iskelet satırlar (dönen simge yalnızca düğme içinde). */}
        {searching ? (
          <View style={{ gap: t.space[3] }}>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : null}

        {error ? <ErrorBanner message={error} /> : null}

        {result && !searching ? (
          <>
            {!result.recognized ? (
              <EmptyState
                icon="camera"
                title="Fotoğrafta kumaşı seçemedik"
                description="Kumaşı düz bir zeminde, yakından ve iyi ışıkta çekip yeniden dene."
              />
            ) : result.results.length === 0 ? (
              <EmptyState
                icon="search"
                title="Görünüşçe benzeyen ürün bulunamadı"
                description="Katalog büyüdükçe sonuçlar artar."
              />
            ) : (
              <View style={{ gap: t.space[3] }}>
                <SectionTitle title={`Benzer kumaşlar · ${result.results.length}`} />
                {note}
                {result.results.map((item) => (
                  <SimilarResultCard
                    key={item.product.id}
                    item={item}
                    onPress={() => navigation.navigate('ProductDetail', { productId: item.product.id })}
                  />
                ))}
              </View>
            )}

            <Button size="lg" kind="secondary" label="Başka fotoğrafla ara" onPress={reset} />
          </>
        ) : null}
      </Screen>
    </View>
  );
}

// Ürün kartının ALTINDA benzerlik rozeti ve nedenler: kartın içine düğme /
// dokunma alanı konmuyor (iç içe düğme olmaz).
function SimilarResultCard({ item, onPress }: { item: SimilarProductResult; onPress: () => void }) {
  const t = useTheme();
  const product = item.product;
  const imageUri = useProductImage(product.id, product.hasImage);
  return (
    <View style={{ gap: t.space[2], minWidth: 0 }}>
      <ProductCard
        name={categoryLabel(product.type, product.subtype ?? '')}
        code={product.code}
        specs={productSpecs(product)}
        companyName={product.company?.name}
        companyVerified={product.company?.verification === 'dogrulanmis'}
        imageUri={imageUri}
        onPress={onPress}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minWidth: 0 }}>
        <Badge kind="info" label={`%${item.similarity} benzer`} />
        {item.reasons.length ? (
          <Text numberOfLines={1} style={[t.type.body14, { color: t.colors.ink2, flex: 1, minWidth: 0 }]}>
            {item.reasons.slice(0, 3).join(' · ')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
