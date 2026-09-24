// {tr('Fotoğrafla kumaş ara')} (DESIGN.md §2/§3). İki fotoğraf yuvası: kumaşın
// fotoğrafı + etiket fotoğrafı (isteğe bağlı). En az biri gerekir. Etiket
// verilirse sunucu içerik etiketini okur (%92 PES %8 EA) ve katalogdaki
// ürünlerin içeriğiyle karşılaştırır; kumaş fotoğrafı görünümü eşler.
// Görünüm: AppBar · giriş kartı (iki yuva + {tr('Benzerlerini ara')}) · sonuçta
// önizleme kartı · "Etiketten okunan" kartı · ProductCard listesi (altında
// rozet + nedenler) · kenarlıklı {tr('Yeni arama')}.
// Ham hex / ham px yok: her değer useTheme() token'ı ya da src/ui bileşeni.
import React, { useLayoutEffect, useState } from 'react';
import { Image, Platform, Text, View } from 'react-native';
import {
  ApiError,
  MAX_LOOK_IMAGE_CHARS,
  searchSimilarByPhoto,
  type LabelReadResult,
  type LookSearchResult,
  type SimilarProductResult,
} from '../../api/client';
import { pickLookPhoto } from '../../features/imagePicker';
import { haptics } from '../../features/haptics';
import { categoryLabel } from '../../features/products/catalog';
import type { RootStackScreenProps } from '../../navigation/types';
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Badge, Button, Card, EmptyState, Icon, ProductCard, Screen, SectionTitle, SkeletonRow } from '../../ui';
import { tr } from '../../i18n';
import { ErrorBanner, productSpecs, useProductImage } from './FavoriteProductsScreen';

type Props = RootStackScreenProps<'SimilarSearch'>;

// Yalnız kumaş fotoğrafıyla: sunucu yalnızca GÖRÜNÜMÜ karşılaştırır; gramaj ve
// içerik fotoğraftan okunmaz — bu sınır ekranda açıkça yazılı.
const HONESTY_NOTE = () =>
  tr('Yalnızca görünüm karşılaştırılır. Gramaj ve içerik fotoğraftan okunamaz; ürün sayfasından kontrol edin.');
const LABEL_NOTE = () => tr('Etiketteki içerik (lif oranları) platformdaki ürünlerin içeriğiyle karşılaştırılır.');
const HINT = () =>
  tr('Mağazada beğendiğiniz kıyafetin kumaşını yakından, etiketini de okunur şekilde çekin; ikisi birlikte daha doğru sonuç verir.');

// Önizleme karesi (DESIGN.md'de adı olmayan ekran-içi ölçü).
const PREVIEW_SIZE = 72;

interface PickedPhoto {
  uri: string;
  dataUrl: string;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'daily_limit') return tr('Günlük 20 arama sınırına ulaştınız, yarın tekrar deneyin.');
    if (err.code === 'llm_not_configured') return tr('Görsel arama şu anda kapalı. Daha sonra tekrar deneyin.');
    if (err.code === 'look_failed') return tr('Fotoğraf incelenemedi. Lütfen tekrar deneyin.');
    if (err.code === 'unsupported_image' || err.code === 'invalid_body')
      return tr('Bu fotoğraf kullanılamadı. Başka bir fotoğrafla deneyin.');
    if (err.status === 401) return tr('Bu arama için giriş yapmanız gerekiyor.');
    return err.message;
  }
  if (err instanceof Error) {
    if (err.message === 'camera_permission_denied') return tr('Kameraya erişim izni verilmedi.');
    if (err.message === 'permission_denied') return tr('Galeriye erişim izni verilmedi.');
    if (err.message === 'image_too_large')
      return tr('Fotoğraf çok büyük. Daha küçük çözünürlükte bir fotoğrafla deneyin.');
  }
  return tr('Arama yapılamadı, lütfen tekrar deneyin.');
}

export function SimilarSearchScreen({ navigation }: Props) {
  const t = useTheme();
  const [fabric, setFabric] = useState<PickedPhoto | null>(null);
  const [label, setLabel] = useState<PickedPhoto | null>(null);
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<LookSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const pick = async (slot: 'fabric' | 'label', source: 'camera' | 'gallery') => {
    setError(null);
    try {
      const picked = await pickLookPhoto(source, MAX_LOOK_IMAGE_CHARS);
      if (!picked) return;
      const photo = { uri: picked.uri, dataUrl: picked.dataUrl };
      if (slot === 'fabric') setFabric(photo);
      else setLabel(photo);
      setResult(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const search = async () => {
    if (!fabric && !label) return;
    setError(null);
    setResult(null);
    setSearching(true);
    try {
      const found = await searchSimilarByPhoto(fabric?.dataUrl ?? null, undefined, label?.dataUrl ?? null);
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
    setFabric(null);
    setLabel(null);
    setResult(null);
    setError(null);
  };

  const labelInfo = result?.label ?? null;
  const usedLabel = Boolean(labelInfo?.read);

  const note = (text: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.space[2], minWidth: 0 }}>
      <Icon name="info" size={t.size.iconSm} color="ink3" />
      <Text style={[t.type.body14, { color: t.colors.ink2, flex: 1, minWidth: 0 }]}>{text}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title={tr('Fotoğrafla kumaş ara')} leading="back" onBack={() => navigation.goBack()} />
      <Screen>
        {!result ? (
          <Card style={{ gap: t.space[3] }}>
            <Text style={[t.type.title18, { color: t.colors.ink }]}>{tr('Beğendiğin kumaşın benzerini bul')}</Text>
            <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{HINT()}</Text>
            <PhotoSlot
              title={tr('Kumaşın fotoğrafı')}
              photo={fabric}
              disabled={searching}
              onPick={(src) => pick('fabric', src)}
              onRemove={() => setFabric(null)}
            />
            <PhotoSlot
              title={tr('Etiket fotoğrafı (isteğe bağlı)')}
              photo={label}
              disabled={searching}
              onPick={(src) => pick('label', src)}
              onRemove={() => setLabel(null)}
            />
            <Button
              size="lg"
              icon="search"
              label={tr('Benzerlerini ara')}
              loading={searching}
              disabled={!fabric && !label}
              onPress={search}
            />
            {note(label ? LABEL_NOTE() : HONESTY_NOTE())}
          </Card>
        ) : null}

        {/* Yükleme: iskelet satırlar (dönen simge yalnızca düğme içinde). */}
        {searching ? (
          <View style={{ gap: t.space[3] }}>
            <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
              {label ? tr('Kumaş ve etiket inceleniyor, birkaç saniye sürebilir.') : tr('Kumaşın görünümü inceleniyor, birkaç saniye sürebilir.')}
            </Text>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : null}

        {error ? <ErrorBanner message={error} /> : null}

        {result && !searching ? (
          <>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
              <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                {fabric ? <Preview uri={fabric.uri} label={tr('Kumaş fotoğrafı')} /> : null}
                {label ? <Preview uri={label.uri} label={tr('Etiket fotoğrafı')} /> : null}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: t.space[1] / 2 }}>
                {result.look ? (
                  <Text style={[t.type.body16Strong, { color: t.colors.ink }]} numberOfLines={3}>
                    {tr('Gördüğümüz: {s}', { s: result.look.summary })}
                  </Text>
                ) : (
                  <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>{tr('Etikete göre arandı')}</Text>
                )}
                {result.remaining <= 5 ? (
                  <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{tr('Bugün {n} arama hakkınız kaldı', { n: result.remaining })}</Text>
                ) : null}
              </View>
            </Card>

            {labelInfo ? <LabelCard info={labelInfo} /> : null}

            {!result.recognized && !usedLabel ? (
              <EmptyState
                icon="camera"
                title={tr('Fotoğrafta kumaşı seçemedik')}
                description={tr('Kumaşı düz bir zeminde, yakından ve iyi ışıkta çekip yeniden dene.')}
              />
            ) : result.results.length === 0 ? (
              <EmptyState
                icon="search"
                title={usedLabel ? tr('Benzeyen ürün bulunamadı') : tr('Görünüşçe benzeyen ürün bulunamadı')}
                description={tr('Katalog büyüdükçe sonuçlar artar.')}
              />
            ) : (
              <View style={{ gap: t.space[3] }}>
                <SectionTitle title={tr('Benzer kumaşlar · {n}', { n: result.results.length })} />
                {note(usedLabel ? LABEL_NOTE() : HONESTY_NOTE())}
                {result.results.map((item) => (
                  <SimilarResultCard
                    key={item.product.id}
                    item={item}
                    onPress={() => navigation.navigate('ProductDetail', { productId: item.product.id })}
                  />
                ))}
              </View>
            )}

            <Button size="lg" kind="secondary" label={tr('Yeni arama')} onPress={reset} />
          </>
        ) : null}
      </Screen>
    </View>
  );
}

function Preview({ uri, label }: { uri: string; label: string }) {
  const t = useTheme();
  return (
    <Image
      source={{ uri }}
      accessibilityLabel={label}
      style={{
        width: PREVIEW_SIZE,
        height: PREVIEW_SIZE,
        borderRadius: t.radius.sm,
        borderWidth: 1,
        borderColor: t.colors.line,
        backgroundColor: t.colors.surface2,
      }}
    />
  );
}

// Tek fotoğraf yuvası: boşken kamera + galeri, doluyken önizleme + {tr('Kaldır')}.
function PhotoSlot({
  title,
  photo,
  disabled,
  onPick,
  onRemove,
}: {
  title: string;
  photo: PickedPhoto | null;
  disabled: boolean;
  onPick: (source: 'camera' | 'gallery') => void;
  onRemove: () => void;
}) {
  const t = useTheme();
  // Kamera yalnızca telefonda; web'de tarayıcı kamerası yok.
  const hasCamera = Platform.OS !== 'web';
  return (
    <View
      style={{
        gap: t.space[2],
        padding: t.space[3],
        borderRadius: t.radius.md,
        borderWidth: 1,
        borderColor: t.colors.line,
        minWidth: 0,
      }}
    >
      <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>{title}</Text>
      {photo ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minWidth: 0 }}>
          <Preview uri={photo.uri} label={title} />
          <Button kind="quiet" icon="close-outline" label={tr('Kaldır')} disabled={disabled} onPress={onRemove} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: t.space[2], flexWrap: 'wrap' }}>
          {hasCamera ? (
            <Button kind="secondary" icon="camera" label={tr('Fotoğraf çek')} disabled={disabled} onPress={() => onPick('camera')} />
          ) : null}
          <Button
            kind="secondary"
            icon="images-outline"
            label={tr('Galeriden seç')}
            disabled={disabled}
            onPress={() => onPick('gallery')}
          />
        </View>
      )}
    </View>
  );
}

// "Etiketten okunan: %92 Polyester %8 Elastan" ya da "Etiket okunamadı" + uyarılar.
function LabelCard({ info }: { info: LabelReadResult }) {
  const t = useTheme();
  return (
    <Card style={{ gap: t.space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minWidth: 0 }}>
        <Icon
          name={info.read ? 'pricetag-outline' : 'warning'}
          size={t.size.iconSm}
          color={info.read ? 'ink2' : 'warning'}
        />
        <Text style={[t.type.body16Strong, { color: t.colors.ink, flex: 1, minWidth: 0 }]}>
          {info.read ? tr('Etiketten okunan: {c}', { c: info.compositionText }) : tr('Etiket okunamadı')}
        </Text>
      </View>
      {info.warnings.map((w) => (
        <Text key={w} style={[t.type.body14, { color: t.colors.warning }]}>
          {w}
        </Text>
      ))}
    </Card>
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
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.space[2], minWidth: 0 }}>
        <Badge kind="info" label={item.look ? tr('%{n} benzer', { n: item.similarity }) : tr('%{n} içerik', { n: item.similarity })} />
        {item.reasons.length ? (
          <Text numberOfLines={3} style={[t.type.body14, { color: t.colors.ink2, flex: 1, minWidth: 0 }]}>
            {item.reasons.slice(0, 4).join(' · ')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
