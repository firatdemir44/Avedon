import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, Linking, Platform, Share, ActivityIndicator } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import {
  confirmProductFields,
  dppQrUrl,
  fetchCertificateImage,
  fetchDpp,
  fetchProduct,
  fetchSimilarProducts,
  fetchTestReportImage,
  setProductFavorite,
  type DppResult,
  type SimilarProductResult,
} from '../../api/client';
import { useFocusLoad } from '../../features/useFocusLoad';
import { SkeletonDetail } from '../../components/Skeleton';
import {
  EmptyState as LegacyEmptyState,
  ErrorState,
  InlineError,
  friendlyMessage,
  isNotFound,
} from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { ImageViewerModal } from '../../components/ImageViewerModal';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { ProductThumbnail } from '../../components/ProductThumbnail';
import { ProductVideos } from '../../components/ProductVideos';
import { PassportCard, toPassportCardProduct } from '../../components/PassportCard';
import { PriceIndexCard } from '../../components/PriceIndexCard';
import { CareSymbolIcon } from '../../components/CareSymbolIcon';
import { careSymbolsView } from '../../features/care/symbols';
import { getCachedGalleryImage, loadGalleryImage } from '../../features/products/productImageCache';
import {
  STOCK_UNIT_LABELS,
  categoryLabel,
  finishTagLabel,
  isYarnType,
  subtypeLabel,
  typeLabel,
  usageLabel,
  yarnRoleLabel,
  yarnTypeLabel,
  yarnUnitLabel,
} from '../../features/products/catalog';
import { certificateLabel, effectiveWidthCm, fiberLabel } from '../../features/products/glossaryLabels';
import { isPdfDataUrl } from '../../components/passport/rows';
import { openPdfDataUrl } from '../../features/docViewer';
import { optionLabel, otherCountLabels, useYarnOptions } from '../../features/yarns/catalog';
import { formatMeasure, toInputNumber } from '../../features/calculators/parse';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Badge, Button, Card, Icon, Screen, SectionTitle } from '../../ui';

type Props = RootStackScreenProps<'ProductDetail'>;

// Onay bekleyen alanların Türkçe adı (sunucudaki fieldMeta.field anahtarları).
const FIELD_LABELS: Record<string, string> = {
  composition: 'içerik',
  yarns: 'iplik',
  certificates: 'sertifika',
  widthType: 'en tipi',
  widthMeaning: 'enin anlamı',
  moq: 'en az sipariş',
  leadTimeDays: 'termin',
  finishTags: 'apre',
  weightGsm: 'gramaj',
  widthCm: 'en',
};

const fieldLabel = (field: string) => FIELD_LABELS[field] ?? field;

// Ana görselin yüksekliği ve küçük görsel karesi (DESIGN.md'de adı olmayan
// ekran-içi ölçüler; token eklemeden önce burada tanımlı).
const HERO_HEIGHT = 260;
const THUMB_SIZE = 60;

// Belge tarihleri: "2027-03-01T00:00:00.000Z" → "01.03.2027".
function formatDocDate(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('tr-TR');
}

// "4,50 USD / kg"
function formatPrice(price: { value: number; currency: string; unit: string }) {
  const unit = price.unit === 'm' || price.unit === 'kg' ? ` / ${STOCK_UNIT_LABELS[price.unit].short}` : '';
  return `${formatMeasure(price.value)} ${price.currency}${unit}`;
}

// Kumaş pasaportundaki iplik satırını iplik dizini süzgecine çevirir
// ("Kim satıyor?" bağlantısı, Faz 2, Adım 6). Kumaş formundaki iplik tipi
// (catalog.ts YARN_TYPES) dizindeki eğirme / penye-karde / filament tipi
// alanlarına dağılıyor; karşılığı olmayan tip (örn. "diger") atılır.
const YARN_TYPE_TO_SPINNING: Record<string, string> = {
  kompakt: 'kompakt',
  open_end: 'open_end',
  vortex: 'vortex',
};
const YARN_TYPE_TO_COMBING: Record<string, string> = { penye: 'penye', karde: 'karde' };
const YARN_TYPE_TO_FILAMENT: Record<string, string> = { dty: 'dty', fdy: 'fdy', poy: 'poy' };

function yarnDirectoryPreset(yarn: { count: number; unit: string; yarnType: string }) {
  return {
    count: toInputNumber(yarn.count),
    countUnit: yarn.unit,
    spinning: YARN_TYPE_TO_SPINNING[yarn.yarnType],
    combing: YARN_TYPE_TO_COMBING[yarn.yarnType],
    filamentType: YARN_TYPE_TO_FILAMENT[yarn.yarnType],
  };
}

// "30 Ne · 2 kat · Penye (ring)" (rol varsa başta).
function formatYarn(yarn: { role: string; count: number; unit: string; ply: number; yarnType: string }) {
  const parts = [`${formatMeasure(yarn.count)} ${yarnUnitLabel(yarn.unit)}`];
  if (yarn.ply > 1) parts.push(`${yarn.ply} kat`);
  if (yarn.yarnType) parts.push(yarnTypeLabel(yarn.yarnType));
  return parts.join(' · ');
}

// --- Ekrana özel küçük bileşenler (src/ui'ye girmeyecek kadar yerel) ---

// Özellik satırı: etiket solda, değer sağda; sayı/ölçü eşit aralıklı yazıyla.
// `sans`: serbest metin (kullanım, not) normal yazıyla.
function SpecRow({ label, value, sans, last }: { label: string; value: string; sans?: boolean; last?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: t.space[4],
        minHeight: t.size.touchMin,
        paddingVertical: t.space[2],
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: t.colors.line,
      }}
    >
      <Text style={[t.type.body16, { color: t.colors.ink2, flexShrink: 1 }]}>{label}</Text>
      <Text
        style={[
          sans ? t.type.body16 : t.type.mono14,
          { color: t.colors.ink, flexShrink: 1, textAlign: 'right' },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

// Sertifika / test raporu / iplik satırı (kart içinde, arada 1px ayırıcı).
function DocRow({
  children,
  last,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  last?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const base = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: t.space[3],
    minHeight: t.size.touchMin,
    paddingVertical: t.space[2],
    borderBottomWidth: last ? 0 : 1,
    borderBottomColor: t.colors.line,
  };
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [base, pressed ? { opacity: 0.6 } : null]}
    >
      {children}
    </Pressable>
  );
}

// Bölüm: başlık + kart. Başlık verilmezse yalnızca kart.
function Section({ title, count, children }: { title?: string; count?: number; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.space[2] }}>
      {title ? <SectionTitle title={count != null ? `${title} (${count})` : title} /> : null}
      <Card>{children}</Card>
    </View>
  );
}

// Ana görsel + altındaki küçük görseller (artboard 3). Fotoğraflar liste
// yanıtında gelmiyor; yalnızca seçili ve komşu sayfalar çekiliyor
// (ProductGallery ile aynı önbellek). Dokununca tam ekran açılır.
function Gallery({
  productId,
  imageCount,
  onOpenImage,
}: {
  productId: string;
  imageCount: number;
  onOpenImage: (url: string) => void;
}) {
  const t = useTheme();
  const [index, setIndex] = useState(0);
  const [urls, setUrls] = useState<(string | null)[]>([]);

  useEffect(() => {
    setIndex(0);
    setUrls(Array.from({ length: imageCount }, (_, i) => getCachedGalleryImage(productId, i) ?? null));
  }, [productId, imageCount]);

  useEffect(() => {
    let cancelled = false;
    for (const i of [index - 1, index, index + 1]) {
      if (i < 0 || i >= imageCount) continue;
      const cached = getCachedGalleryImage(productId, i);
      if (cached) {
        setUrls((prev) => (prev[i] === cached ? prev : Object.assign([...prev], { [i]: cached })));
        continue;
      }
      loadGalleryImage(productId, i)
        .then((url) => {
          if (!cancelled) setUrls((prev) => Object.assign([...prev], { [i]: url }));
        })
        .catch(() => {
          // Gelmeyen fotoğrafın yerinde yer tutucu kalır.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [productId, imageCount, index]);

  if (imageCount === 0) {
    return (
      <View
        style={{
          height: HERO_HEIGHT,
          backgroundColor: t.colors.surface2,
          alignItems: 'center',
          justifyContent: 'center',
          gap: t.space[2],
        }}
      >
        <Icon name="fabric" size={t.size.emptyIcon} color="ink3" />
        <Text style={[t.type.body14, { color: t.colors.ink3 }]}>Bu ürünün fotoğrafı yok</Text>
      </View>
    );
  }

  const current = urls[index];
  return (
    <View style={{ gap: t.space[3] }}>
      <Pressable
        onPress={() => current && onOpenImage(current)}
        disabled={!current}
        accessibilityRole="imagebutton"
        accessibilityLabel={`Fotoğraf ${index + 1} / ${imageCount}`}
        accessibilityHint="Tam ekran büyütür"
        style={({ pressed }) => [
          { height: HERO_HEIGHT, backgroundColor: t.colors.surface2 },
          pressed ? { opacity: 0.9 } : null,
        ]}
      >
        {current ? (
          <Image source={{ uri: current }} style={{ width: '100%', height: HERO_HEIGHT }} resizeMode="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={t.colors.ink3} />
          </View>
        )}
      </Pressable>

      {imageCount > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: t.space[4], gap: t.space[2] }}
        >
          {Array.from({ length: imageCount }, (_, i) => (
            <Pressable
              key={i}
              onPress={() => setIndex(i)}
              accessibilityRole="button"
              accessibilityState={{ selected: i === index }}
              accessibilityLabel={`Fotoğraf ${i + 1}`}
              style={{
                width: THUMB_SIZE,
                height: THUMB_SIZE,
                borderRadius: t.radius.sm,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: i === index ? t.colors.brand : t.colors.line,
                backgroundColor: t.colors.surface2,
              }}
            >
              {urls[i] ? (
                <Image source={{ uri: urls[i] as string }} style={{ flex: 1 }} resizeMode="cover" />
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

// Taslak: design/artboards/3-Ürün-detayı.png. Üst bant + tam genişlik görsel,
// kod + STOKTA rozeti, ürün adı, firma satırı, çizgili özellik kartı, ardından
// pasaport bölümleri; eylemler yapışkan alt çubukta.
export function ProductDetailScreen({ route, navigation }: Props) {
  const { productId } = route.params;
  const { user } = useSession();
  const t = useTheme();
  // İplik etiketleri (Faz 2, Adım 6); kumaşta kullanılmaz ama kanca koşulsuz.
  const yarnOptions = useYarnOptions();
  // Düzenleme ekranından dönünce güncel veri görünsün diye odakta yenileniyor
  // (ilk yüklemeden sonra sessizce).
  const { data: product, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchProduct(productId).then(({ product: fetched }) => fetched)
  );
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  // Onaylandıktan sonra şerit hemen kalkar (yeniden yüklemeyi beklemeden).
  const [fieldsConfirmed, setFieldsConfirmed] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    if (product) setFavorite(!!product.isFavorite);
  }, [product]);

  useEffect(() => {
    setFieldsConfirmed(false);
  }, [productId]);

  // Faz 3, Adım 3: "Benzer kumaşlar". Sayfanın ana yüklenmesini beklemeyen
  // ayrı ve SESSİZ istek: hata olursa (ya da ürünün görünüm kartı yoksa)
  // bölüm hiç görünmez.
  const [similar, setSimilar] = useState<SimilarProductResult[]>([]);
  useEffect(() => {
    let cancelled = false;
    setSimilar([]);
    fetchSimilarProducts(productId)
      .then(({ look, results }) => {
        if (!cancelled && look) setSimilar(results);
      })
      .catch(() => {
        // Sessiz: benzer kumaşlar bölümü gizli kalır.
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  // Faz 3, Adım 7: "Dijital pasaport" (AB Dijital Ürün Pasaportu'na hazırlık).
  // Benzer kumaşlar gibi AYRI ve SESSİZ istek: sayfanın ana yüklenmesini
  // beklemez, hata olursa bölüm hiç çizilmez. `missing` yalnızca sahibine gelir.
  const [dpp, setDpp] = useState<DppResult | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setDpp(null);
    setLinkCopied(false);
    fetchDpp(productId)
      .then((result) => {
        if (!cancelled) setDpp(result);
      })
      .catch(() => {
        // Sessiz: dijital pasaport bölümü gizli kalır.
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        <AppBar title="Ürün" leading="back" onBack={() => navigation.goBack()} />
        <SkeletonDetail variant="product" />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        <AppBar title="Ürün" leading="back" onBack={() => navigation.goBack()} />
        {error && !isNotFound(error) ? (
          <ErrorState error={error} fallback="Ürün alınamadı" onRetry={reload} />
        ) : (
          <LegacyEmptyState icon="cube-outline" title="Ürün bulunamadı" message="Ürün kaldırılmış olabilir." />
        )}
      </View>
    );
  }

  const isOwnProduct = !!user?.companyId && user.companyId === product.companyId;
  const company = product.company;
  const openCompany = () => navigation.navigate('CompanyProfile', { companyId: product.companyId });
  // İplik (Faz 2, Adım 6): kumaşa özel her şey (pasaport kartı, gramaj/en,
  // örgü, apre, kumaş iplik satırları) gizlenir; yerine iplik özellik tablosu.
  const isYarn = isYarnType(product.type);
  const yarnSpec = product.yarn ?? null;
  const usages = isYarn ? '' : (product.usages ?? []).map(usageLabel).join(', ');
  // Ürün adı: alt çeşit varsa o ("Özel Polar"), yoksa çeşit ("Örme" / "İplik").
  const productName = subtypeLabel(product.type, product.subtype) || typeLabel(product.type);

  // --- Kumaş pasaportu ---
  const composition = product.composition ?? [];
  const compositionTotal = composition.reduce((sum, item) => sum + item.percent, 0);
  const compositionText = composition.map((item) => `%${formatMeasure(item.percent)} ${fiberLabel(item.fiber)}`).join(' · ');
  const finishTags = isYarn ? [] : product.finishTags ?? [];
  // Bilinmeyen anahtarlar atılır, grup sırasına dizilir.
  const careSymbols = isYarn ? [] : careSymbolsView(product.careSymbols ?? []);
  const yarns = isYarn ? [] : product.yarns ?? [];
  const testReports = product.testReports ?? [];
  // Detay yanıtı sertifikaların tamamını taşır; liste yanıtında yalnızca adlar var.
  const certificates =
    product.certificates ??
    (product.certificateNames ?? []).map((name, index) => ({
      position: index,
      name,
      number: '',
      validUntil: null as string | null,
      hasImage: false,
    }));
  // Çıkarımdan gelip henüz onaylanmayan alanlar (yalnızca sahibine geliyor).
  const pendingFields = fieldsConfirmed
    ? []
    : (product.fieldMeta ?? []).filter((meta) => !meta.confirmedAt).map((meta) => meta.field);

  // Akıştaki kartın aynısı; ürün sayfasında dokunulamaz (onPress yok).
  const passportCardProduct = toPassportCardProduct({ ...product, certificates });

  // Tek yüz tüp eninde hesap eni açıkça yazılır:
  // "80 cm tek yüz tüp eni · hesap eni 160 cm".
  const widthSpec =
    !isYarn && product.widthType === 'tup' && product.widthMeaning === 'tup_tek_yuz'
      ? `${formatMeasure(product.widthCm)} cm tek yüz tüp eni · hesap eni ${formatMeasure(
          product.effectiveWidthCm ?? effectiveWidthCm(product.widthCm, product.widthMeaning)
        )} cm`
      : `${formatMeasure(product.widthCm)} cm`;

  const stockText = `${formatMeasure(product.stock)} ${STOCK_UNIT_LABELS[product.stockUnit].short}`;
  const moqText =
    product.moq != null
      ? `${formatMeasure(product.moq)}${product.moqUnit ? ` ${STOCK_UNIT_LABELS[product.moqUnit].short}` : ''}`
      : '';

  // İplik özellik tablosu: numara (+ diğer birimlerdeki karşılığı), çeşit,
  // eğirme, penye/karde, filament, parlaklık, büküm, kullanım yeri, renk,
  // menşe/marka/bobin. Boş alanlar hiç satır açmaz.
  const yarnSpecs: { label: string; value: string; sans?: boolean }[] = yarnSpec
    ? [
        { label: 'Numara', value: yarnSpec.countLabel },
        ...(yarnSpec.ply > 1 ? [{ label: 'Kat', value: String(yarnSpec.ply) }] : []),
        { label: 'İplik çeşidi', value: optionLabel(yarnOptions.families, yarnSpec.family), sans: true },
        ...(yarnSpec.variety ? [{ label: 'Çeşit / yapı', value: yarnSpec.variety, sans: true }] : []),
        ...(yarnSpec.spinning
          ? [{ label: 'Eğirme', value: optionLabel(yarnOptions.spinnings, yarnSpec.spinning), sans: true }]
          : []),
        ...(yarnSpec.combing
          ? [{ label: 'Penye / karde', value: optionLabel(yarnOptions.combings, yarnSpec.combing), sans: true }]
          : []),
        ...(yarnSpec.filaments != null ? [{ label: 'Filament sayısı', value: String(yarnSpec.filaments) }] : []),
        ...(yarnSpec.filamentType
          ? [{ label: 'Filament tipi', value: optionLabel(yarnOptions.filamentTypes, yarnSpec.filamentType), sans: true }]
          : []),
        ...(yarnSpec.luster
          ? [{ label: 'Parlaklık', value: optionLabel(yarnOptions.lusters, yarnSpec.luster), sans: true }]
          : []),
        ...(yarnSpec.twistDirection || yarnSpec.twistTpm != null
          ? [
              {
                label: 'Büküm',
                value: [yarnSpec.twistDirection, yarnSpec.twistTpm != null ? `${formatMeasure(yarnSpec.twistTpm)} T/m` : '']
                  .filter(Boolean)
                  .join(' · '),
              },
            ]
          : []),
        ...(yarnSpec.endUses.length
          ? [
              {
                label: 'Kullanım yeri',
                value: yarnSpec.endUses.map((key) => optionLabel(yarnOptions.endUses, key)).join(', '),
                sans: true,
              },
            ]
          : []),
        ...(yarnSpec.colorState || yarnSpec.color
          ? [
              {
                label: 'Renk',
                value: [optionLabel(yarnOptions.colorStates, yarnSpec.colorState), yarnSpec.color]
                  .filter(Boolean)
                  .join(' · '),
                sans: true,
              },
            ]
          : []),
        ...(yarnSpec.origin ? [{ label: 'Menşe', value: yarnSpec.origin, sans: true }] : []),
        ...(yarnSpec.brand ? [{ label: 'Marka', value: yarnSpec.brand, sans: true }] : []),
        ...(yarnSpec.coneWeightKg != null
          ? [{ label: 'Bobin', value: `${formatMeasure(yarnSpec.coneWeightKg)} kg` }]
          : []),
        { label: 'Stok', value: `${formatMeasure(product.stock)} kg` },
        ...(yarnSpec.sellerRole
          ? [{ label: 'Satıcı', value: optionLabel(yarnOptions.sellerRoles, yarnSpec.sellerRole), sans: true }]
          : []),
        ...(moqText ? [{ label: 'Min. sipariş', value: moqText }] : []),
      ]
    : [];

  // "30/1 Ne" kayıtlıysa diğer sistemlerdeki karşılığı küçük gri satırda.
  const otherCounts = yarnSpec ? otherCountLabels(yarnSpec.countDtex, yarnSpec.countUnit) : '';

  // Artboard 3'teki özellik kartı (kumaş): tip, gramaj, en, içerik, stok,
  // kullanım, min. sipariş. Boş olan satır çizilmez.
  const specs: { label: string; value: string; sans?: boolean }[] = isYarn
    ? yarnSpecs
    : [
        { label: 'Kumaş tipi', value: categoryLabel(product.type, product.subtype), sans: true },
        ...(product.weightGsm ? [{ label: 'Gramaj', value: `${formatMeasure(product.weightGsm)} gr/m²` }] : []),
        ...(product.widthCm ? [{ label: 'En', value: widthSpec }] : []),
        ...(compositionText || product.content
          ? [{ label: 'İçerik', value: compositionText || product.content }]
          : []),
        { label: 'Stok', value: stockText },
        ...(usages ? [{ label: 'Kullanım', value: usages, sans: true }] : []),
        ...(moqText ? [{ label: 'Min. sipariş', value: moqText }] : []),
        ...(product.useArea ? [{ label: 'Not', value: product.useArea, sans: true }] : []),
      ];

  const commercial: { label: string; value: string }[] = [
    ...(product.leadTimeDays != null ? [{ label: 'Termin', value: `${product.leadTimeDays} gün` }] : []),
    // Fiyat yanıtta yalnızca sahibine geliyor; başkasına alan hiç gelmiyor.
    ...(product.price ? [{ label: 'Fiyat', value: formatPrice(product.price) }] : []),
  ];

  const openDocImage = async (kind: 'certificate' | 'report', position: number) => {
    try {
      const { imageUrl } =
        kind === 'certificate'
          ? await fetchCertificateImage(product.id, position)
          : await fetchTestReportImage(product.id, position);
      // Belge PDF ise Image ile çizilemez: web'de yeni sekme, telefonda
      // sistemin kendi açma/paylaşma ekranı.
      if (isPdfDataUrl(imageUrl)) {
        await openPdfDataUrl(imageUrl, kind === 'certificate' ? 'sertifika.pdf' : 'test-raporu.pdf');
        return;
      }
      setViewerUrl(imageUrl);
    } catch {
      haptics.error();
    }
  };

  const confirmFields = async () => {
    if (confirmBusy || !pendingFields.length) return;
    setConfirmBusy(true);
    try {
      await confirmProductFields(product.id, pendingFields);
      haptics.success();
      setFieldsConfirmed(true);
    } catch {
      haptics.error();
    } finally {
      setConfirmBusy(false);
    }
  };

  // "Takibe Al" (kayıt ProductFavorite; etiket Faz 1 Adım 6'da değişti).
  // İyimser: işaret hemen değişir, sunucu reddederse geri döner.
  const toggleFavorite = async () => {
    if (favoriteBusy) return;
    const next = !favorite;
    setFavorite(next);
    setFavoriteBusy(true);
    haptics.light();
    try {
      const result = await setProductFavorite(product.id, next);
      setFavorite(result.isFavorite);
    } catch {
      setFavorite(!next);
      haptics.error();
    } finally {
      setFavoriteBusy(false);
    }
  };

  // --- Dijital pasaport (Faz 3, Adım 7) ---
  const passportUrl = dpp?.passport.identifier.url ?? '';
  const openPassportPage = () => {
    if (passportUrl) Linking.openURL(passportUrl).catch(() => {});
  };
  const openQr = () => {
    Linking.openURL(dppQrUrl(product.id)).catch(() => {});
  };
  const sharePassportLink = async () => {
    if (!passportUrl) return;
    const message = `${product.code} dijital pasaportu:\n${passportUrl}`;
    if (Platform.OS === 'web') {
      // Web'de paylaşım penceresi yok: bağlantı panoya kopyalanır.
      const clipboard = (globalThis as { navigator?: { clipboard?: { writeText(text: string): Promise<void> } } })
        .navigator?.clipboard;
      try {
        if (!clipboard) throw new Error('clipboard_yok');
        await clipboard.writeText(passportUrl);
        setLinkCopied(true);
      } catch {
        // Kopyalanamazsa bağlantıyı yeni sekmede açalım, kullanıcı adres
        // çubuğundan kopyalayabilsin.
        openPassportPage();
      }
      return;
    }
    Share.share({ message }).catch(() => {});
  };
  // Eksik listesi yalnızca sahibine geliyor; başkasında `missing` hiç yok.
  const dppMissing = isOwnProduct ? dpp?.missing ?? [] : [];
  const openPassportEdit = () =>
    isYarn
      ? navigation.navigate('YarnForm', { yarnId: product.id })
      : navigation.navigate('AddProduct', { productId: product.id });

  const openEdit = () =>
    isYarn
      ? navigation.navigate('YarnForm', { yarnId: product.id })
      : navigation.navigate('AddProduct', { productId: product.id });

  // Üst banttaki ikonlar: favori (kendi ürününde yok) ve paylaş.
  const barActions = [
    ...(isOwnProduct
      ? []
      : [
          {
            icon: (favorite ? 'heart' : 'heart-outline') as 'heart',
            label: favorite ? 'Takipten çık' : 'Takibe al',
            onPress: toggleFavorite,
          },
        ]),
    ...(passportUrl
      ? [{ icon: 'share' as const, label: linkCopied ? 'Bağlantı kopyalandı' : 'Paylaş', onPress: sharePassportLink }]
      : []),
  ];

  // Yapışkan alt çubuk: ekranın tek dolu düğmesi "Numune talep et"; altında iki
  // eşit sütun kenarlıklı eylem. Kendi ürününde düzenleme eylemleri.
  const sticky = isOwnProduct ? (
    <View style={{ flexDirection: 'row', gap: t.space[2] }}>
      <Button
        kind="secondary"
        label={isYarn ? 'İpliği düzenle' : 'Ürünü düzenle'}
        icon="create-outline"
        onPress={openEdit}
        style={{ flex: 1 }}
      />
      <Button
        kind="secondary"
        label="Gönderide paylaş"
        icon="share"
        accessibilityLabel="Bu ürünü gönderide paylaş"
        onPress={() => navigation.navigate('CreatePost', { productId: product.id })}
        style={{ flex: 1 }}
      />
    </View>
  ) : (
    <View style={{ gap: t.space[2] }}>
      <Button
        size="lg"
        label="Numune talep et"
        icon="sample"
        onPress={() =>
          navigation.navigate('SampleRequestForm', { productId: product.id, productCode: product.code })
        }
      />
      <View style={{ flexDirection: 'row', gap: t.space[2] }}>
        <Button
          kind="secondary"
          label="Teklif iste"
          icon="quote"
          onPress={() =>
            navigation.navigate('QuoteRequestForm', {
              productId: product.id,
              productCode: product.code,
              stockUnit: product.stockUnit,
            })
          }
          style={{ flex: 1 }}
        />
        {company ? (
          <Button
            kind="secondary"
            label="Asistana sor"
            icon="message"
            accessibilityLabel={`${company.name} asistanına ${product.code} hakkında sor`}
            onPress={() =>
              navigation.navigate('SellerAssistant', {
                companyId: company.id,
                companyName: company.name,
                productCode: product.code,
              })
            }
            style={{ flex: 1 }}
          />
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title={productName} leading="back" onBack={() => navigation.goBack()} actions={barActions} />

      <Screen scroll={false} noPadding sticky={sticky} contentStyle={{ paddingTop: 0, gap: 0 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: t.space[6] }}
          refreshControl={refreshControl(refreshing, refresh)}
        >
          <Gallery
            productId={product.id}
            imageCount={product.imageCount ?? (product.hasImage ? 1 : 0)}
            onOpenImage={setViewerUrl}
          />

          <View style={{ paddingHorizontal: t.space[4], paddingTop: t.space[4], gap: t.space[6] }}>
            {isOwnProduct && pendingFields.length ? (
              <Card style={{ borderColor: t.colors.warning, gap: t.space[3] }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.space[2] }}>
                  <Icon name="warning" size={t.size.iconSm} color="warning" />
                  <Text style={[t.type.body14, { color: t.colors.ink, flex: 1 }]}>
                    Bu ürünün {pendingFields.map(fieldLabel).join(', ')} alanı metinden otomatik çıkarıldı. Doğru mu?
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                  <Button
                    kind="secondary"
                    label={confirmBusy ? 'Onaylanıyor…' : 'Onayla'}
                    icon="check"
                    disabled={confirmBusy}
                    onPress={confirmFields}
                    style={{ flex: 1 }}
                  />
                  <Button
                    kind="secondary"
                    label="Düzenle"
                    icon="create-outline"
                    onPress={() => navigation.navigate('AddProduct', { productId: product.id })}
                    style={{ flex: 1 }}
                  />
                </View>
              </Card>
            ) : null}

            {/* Kod + STOKTA rozeti, ürün adı, firma satırı */}
            <View style={{ gap: t.space[2] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
                <Text style={[t.type.mono14, { color: t.colors.ink2 }]}>{product.code}</Text>
                {product.stock > 0 ? <Badge kind="info" label="Stokta" /> : null}
              </View>
              <Text accessibilityRole="header" style={[t.type.title22, { color: t.colors.ink }]}>
                {productName}
              </Text>

              {company ? (
                <Pressable
                  onPress={openCompany}
                  accessibilityRole="button"
                  accessibilityLabel={`${company.name}, firma sayfasını aç`}
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: t.space[2],
                      minHeight: t.size.touchMin,
                    },
                    pressed ? { opacity: 0.6 } : null,
                  ]}
                >
                  <CompanyAvatar
                    name={company.name}
                    verification={company.verification}
                    size={t.size.avatarSm}
                    companyId={company.id}
                    logoUpdatedAt={company.logoUpdatedAt}
                  />
                  <Text numberOfLines={1} style={[t.type.body16, { color: t.colors.ink, flexShrink: 1 }]}>
                    {company.name}
                  </Text>
                  {company.verification === 'dogrulanmis' ? <Badge kind="verified" /> : null}
                  <Text style={[t.type.body14, { color: t.colors.ink3 }]}>{product.companyProductCount} ürün</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Özellik kartı (artboard 3) */}
            {specs.length ? (
              <Card>
                {specs.map((spec, index) => (
                  <SpecRow
                    key={spec.label}
                    label={spec.label}
                    value={spec.value}
                    sans={spec.sans}
                    last={index === specs.length - 1}
                  />
                ))}
                {isYarn && otherCounts ? (
                  <Text style={[t.type.body14, { color: t.colors.ink3, paddingTop: t.space[2] }]}>
                    Diğer birimlerde: {otherCounts}
                  </Text>
                ) : null}
              </Card>
            ) : null}

            {commercial.length ? (
              <Section title="Ticari">
                {commercial.map((row, index) => (
                  <SpecRow key={row.label} label={row.label} value={row.value} last={index === commercial.length - 1} />
                ))}
                {product.price ? (
                  <Text style={[t.type.body14, { color: t.colors.ink3, paddingTop: t.space[2] }]}>
                    Fiyatı yalnızca siz görüyorsunuz.
                  </Text>
                ) : null}
              </Section>
            ) : null}

            {/* Kumaş pasaportu kartı (iplikte gösterilmez: gramaj/en 0) */}
            {!isYarn ? (
              <View style={{ gap: t.space[2] }}>
                <SectionTitle title="Kumaş pasaportu" />
                <PassportCard product={passportCardProduct} />
              </View>
            ) : null}

            {composition.length ? (
              <Section title="Kompozisyon">
                {composition.map((item) => (
                  <View key={`${item.fiber}-${item.percent}`} style={{ paddingVertical: t.space[1], gap: t.space[1] }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: t.space[2],
                      }}
                    >
                      <Text style={[t.type.body16, { color: t.colors.ink, flexShrink: 1 }]}>
                        {fiberLabel(item.fiber)}
                      </Text>
                      <Text style={[t.type.mono14, { color: t.colors.ink }]}>%{formatMeasure(item.percent)}</Text>
                    </View>
                    <View
                      style={{
                        height: t.space[1],
                        borderRadius: t.radius.sm,
                        backgroundColor: t.colors.surface2,
                        overflow: 'hidden',
                      }}
                    >
                      <View
                        style={{
                          height: t.space[1],
                          borderRadius: t.radius.sm,
                          backgroundColor: t.colors.accent,
                          width: `${Math.min(100, item.percent)}%`,
                        }}
                      />
                    </View>
                  </View>
                ))}
                {compositionTotal !== 100 ? (
                  <Text style={[t.type.body14, { color: t.colors.ink3, paddingTop: t.space[2] }]}>
                    Toplam %{formatMeasure(compositionTotal)}
                  </Text>
                ) : null}
              </Section>
            ) : null}

            {/* Fotoğrafların ardından videolar (en çok 3). Video varsa herkes
                izler; ekleme/kaldırma yalnızca ürünün sahibi firmada. */}
            <ProductVideos productId={product.id} isOwner={isOwnProduct} />

            {certificates.length ? (
              <Section title="Sertifikalar" count={certificates.length}>
                {certificates.map((certificate, index) => {
                  const meta = [
                    certificate.number ? `No ${certificate.number}` : '',
                    certificate.validUntil ? `${formatDocDate(certificate.validUntil)} tarihine kadar` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <DocRow
                      key={`${certificate.position}-${certificate.name}`}
                      last={index === certificates.length - 1}
                      onPress={
                        certificate.hasImage ? () => openDocImage('certificate', certificate.position) : undefined
                      }
                      accessibilityLabel={`${certificateLabel(certificate.name)} belgesini aç`}
                    >
                      <Icon name="checkmark-circle-outline" size={t.size.iconSm} color="success" />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[t.type.body16, { color: t.colors.ink }]}>
                          {certificateLabel(certificate.name)}
                        </Text>
                        {meta ? <Text style={[t.type.body14, { color: t.colors.ink3 }]}>{meta}</Text> : null}
                      </View>
                      {certificate.hasImage ? <Icon name="image-outline" size={t.size.iconSm} color="ink3" /> : null}
                    </DocRow>
                  );
                })}
              </Section>
            ) : null}

            {/* Bakım sembolleri: etiketteki işaretler yatay sırada (yalnızca kumaşta). */}
            {!isYarn && careSymbols.length ? (
              <Section title="Bakım">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[4] }}>
                  {careSymbols.map((symbol) => (
                    <View
                      key={symbol.key}
                      accessibilityLabel={symbol.label}
                      style={{ width: t.size.thumb, alignItems: 'center', gap: t.space[1] }}
                    >
                      <CareSymbolIcon shape={symbol.shape} size={t.size.chip} color={t.colors.ink} />
                      <Text numberOfLines={2} style={[t.type.body14, { color: t.colors.ink3, textAlign: 'center' }]}>
                        {symbol.label}
                      </Text>
                    </View>
                  ))}
                </View>
                {product.careNotes ? (
                  <Text style={[t.type.body14, { color: t.colors.ink3, paddingTop: t.space[2] }]}>
                    {product.careNotes}
                  </Text>
                ) : null}
              </Section>
            ) : null}

            {finishTags.length ? (
              <Section title="Apre / boya">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
                  {finishTags.map((tag) => (
                    <View
                      key={tag}
                      style={{
                        borderRadius: t.radius.sm,
                        backgroundColor: t.colors.brandSoft,
                        paddingHorizontal: t.space[2],
                        paddingVertical: t.space[1],
                      }}
                    >
                      <Text style={[t.type.body14, { color: t.colors.brand }]}>{finishTagLabel(tag)}</Text>
                    </View>
                  ))}
                </View>
              </Section>
            ) : null}

            {/* İplik görünümü: kumaşın iplikleri + iplik dizinine bağlantı. */}
            {yarns.length ? (
              <Section title="İplik" count={yarns.length}>
                {yarns.map((yarn, index) => (
                  <DocRow key={yarn.position} last={index === yarns.length - 1}>
                    <Icon name="yarn" size={t.size.iconSm} color="ink2" />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[t.type.body16, { color: t.colors.ink }]}>
                        {yarn.role ? yarnRoleLabel(yarn.role) : `${index + 1}. iplik`}
                      </Text>
                      <Text style={[t.type.mono14, { color: t.colors.ink2 }]}>{formatYarn(yarn)}</Text>
                    </View>
                    {/* İplik dizinini bu numarayla ön dolu açar. Satırın YANINDA
                        ayrı bir dokunma alanı (web'de iç içe düğme olmasın). */}
                    <Pressable
                      onPress={() =>
                        navigation.navigate('YarnDirectory', {
                          preset: yarnDirectoryPreset(yarn),
                          presetKey: Date.now(),
                        })
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`${formatYarn(yarn)} ipliğini kimler satıyor, iplik dizininde ara`}
                      style={({ pressed }) => [
                        { minHeight: t.size.touchMin, justifyContent: 'center', paddingLeft: t.space[2] },
                        pressed ? { opacity: 0.6 } : null,
                      ]}
                    >
                      <Text style={[t.type.label14, { color: t.colors.brand }]}>Kim satıyor?</Text>
                    </Pressable>
                  </DocRow>
                ))}
              </Section>
            ) : null}

            {testReports.length ? (
              <Section title="Test raporları" count={testReports.length}>
                {testReports.map((report, index) => {
                  const meta = [report.result, formatDocDate(report.testedAt)].filter(Boolean).join(' · ');
                  return (
                    <DocRow
                      key={report.position}
                      last={index === testReports.length - 1}
                      onPress={report.hasImage ? () => openDocImage('report', report.position) : undefined}
                      accessibilityLabel={`${report.kind} raporunu aç`}
                    >
                      <Icon name="requests" size={t.size.iconSm} color="ink2" />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[t.type.body16, { color: t.colors.ink }]}>{report.kind}</Text>
                        {meta ? <Text style={[t.type.body14, { color: t.colors.ink3 }]}>{meta}</Text> : null}
                      </View>
                      {report.hasImage ? <Icon name="image-outline" size={t.size.iconSm} color="ink3" /> : null}
                    </DocRow>
                  );
                })}
              </Section>
            ) : null}

            {/* Anonim piyasa aralığı: yalnızca oturum açmış kullanıcıya, veri
                yoksa kart hiç çizilmez (`hideWhenUnavailable`). */}
            {user ? <PriceIndexCard productId={productId} hideWhenUnavailable /> : null}

            {/* Görünüşçe benzeyen kumaşlar (yalnızca kumaşta ve sonuç varsa). */}
            {!isYarn && similar.length ? (
              <View style={{ gap: t.space[2] }}>
                <SectionTitle title="Benzer kumaşlar" />
                <Card noPadding style={{ paddingVertical: t.space[4] }}>
                  <Text style={[t.type.body14, { color: t.colors.ink3, paddingHorizontal: t.space[4] }]}>
                    Görünüşe göre benzer
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: t.space[4], paddingTop: t.space[3], gap: t.space[3] }}
                  >
                    {similar.map((item) => (
                      <Pressable
                        key={item.product.id}
                        onPress={() => navigation.push('ProductDetail', { productId: item.product.id })}
                        accessibilityRole="button"
                        accessibilityLabel={`${item.product.code}, ${
                          item.product.company?.name ?? ''
                        }, yüzde ${item.similarity} benzer`}
                        style={({ pressed }) => [
                          { width: t.size.quickAction, gap: t.space[1] },
                          pressed ? { opacity: 0.6 } : null,
                        ]}
                      >
                        <ProductThumbnail
                          productId={item.product.id}
                          hasImage={item.product.hasImage}
                          size={t.size.quickAction}
                        />
                        <Text numberOfLines={1} style={[t.type.mono14, { color: t.colors.ink }]}>
                          {item.product.code}
                        </Text>
                        {item.product.company ? (
                          <Text numberOfLines={1} style={[t.type.body14, { color: t.colors.ink2 }]}>
                            {item.product.company.name}
                          </Text>
                        ) : null}
                        <Text style={[t.type.body14, { color: t.colors.ink3 }]}>%{item.similarity} benzer</Text>
                        {item.reasons[0] ? (
                          <Text numberOfLines={1} style={[t.type.body14, { color: t.colors.ink3 }]}>
                            {item.reasons[0]}
                          </Text>
                        ) : null}
                      </Pressable>
                    ))}
                  </ScrollView>
                </Card>
              </View>
            ) : null}

            {/* AB Dijital Ürün Pasaportu'na HAZIRLIK. Herkes pasaport sayfasını
                açıp paylaşabilir; doluluk, eksik listesi ve QR yalnızca sahibine. */}
            {dpp ? (
              <Section title="Dijital pasaport">
                <View style={{ gap: t.space[3] }}>
                  <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                    Bu ürünün herkese açık pasaport sayfası hazır. Sayfada fiyat ve stok görünmez.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                    <Button
                      kind="secondary"
                      label="Pasaportu aç"
                      icon="open-outline"
                      onPress={openPassportPage}
                      style={{ flex: 1 }}
                    />
                    <Button
                      kind="secondary"
                      label={linkCopied ? 'Kopyalandı' : 'Bağlantıyı paylaş'}
                      icon={linkCopied ? 'check' : 'share'}
                      onPress={sharePassportLink}
                      style={{ flex: 1 }}
                    />
                  </View>

                  {isOwnProduct ? (
                    <>
                      <View style={{ gap: t.space[1] }}>
                        <Text style={[t.type.mono14, { color: t.colors.ink }]}>%{dpp.completenessPercent} hazır</Text>
                        <View
                          style={{
                            height: t.space[1],
                            borderRadius: t.radius.sm,
                            backgroundColor: t.colors.surface2,
                            overflow: 'hidden',
                          }}
                        >
                          <View
                            style={{
                              height: t.space[1],
                              borderRadius: t.radius.sm,
                              backgroundColor: t.colors.accent,
                              width: `${Math.max(0, Math.min(100, dpp.completenessPercent))}%`,
                            }}
                          />
                        </View>
                      </View>

                      {dppMissing.length ? (
                        <View style={{ gap: t.space[1] }}>
                          <Text style={[t.type.label14, { color: t.colors.ink2 }]}>Eksik bilgiler</Text>
                          {dppMissing.map((item) => (
                            <View
                              key={item.key}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}
                            >
                              <Icon name="warning" size={t.size.iconXs} color="warning" />
                              <Text style={[t.type.body14, { color: t.colors.ink, flex: 1 }]}>{item.label}</Text>
                            </View>
                          ))}
                          <Button
                            kind="secondary"
                            label="Düzenle"
                            icon="create-outline"
                            onPress={openPassportEdit}
                            style={{ alignSelf: 'flex-start', marginTop: t.space[1] }}
                          />
                        </View>
                      ) : null}

                      <View style={{ alignItems: 'center', gap: t.space[3] }}>
                        <Image
                          source={{ uri: dppQrUrl(product.id) }}
                          style={{
                            width: t.size.emptyTextWidth,
                            height: t.size.emptyTextWidth,
                            maxWidth: '100%',
                            borderRadius: t.radius.md,
                            backgroundColor: t.colors.surface1,
                          }}
                          resizeMode="contain"
                          accessibilityLabel={`${product.code} pasaport sayfasının QR kodu`}
                        />
                        <Text style={[t.type.body14, { color: t.colors.ink3, textAlign: 'center' }]}>
                          QR'ı etiketinize ya da kartelanıza basabilirsiniz; okutan kişi fiyatsız, stoksuz pasaport
                          sayfasını görür.
                        </Text>
                        <Button kind="secondary" label="QR'ı aç / indir" icon="qr-code-outline" onPress={openQr} />
                      </View>
                    </>
                  ) : null}

                  <Text style={[t.type.body14, { color: t.colors.ink3 }]}>
                    AB'nin tekstil için zorunlu alanları henüz yayımlanmadı; bu bir hazırlıktır.
                  </Text>
                </View>
              </Section>
            ) : null}

            {error ? (
              <InlineError message={friendlyMessage(error, 'Ürün bilgisi yenilenemedi')} onRetry={reload} />
            ) : null}

            {/* Yasal / bilgi notu: yapışkan çubuğun hemen üstünde. */}
            {!isOwnProduct ? (
              <Text style={[t.type.body14, { color: t.colors.ink3 }]}>
                Numune ücretsizdir; kargo alıcıya aittir. Teklif için miktar ve teslim tarihini belirtin.
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </Screen>

      <ImageViewerModal imageUrl={viewerUrl} visible={!!viewerUrl} onClose={() => setViewerUrl(null)} />
    </View>
  );
}
