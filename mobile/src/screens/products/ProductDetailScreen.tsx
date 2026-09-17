import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import {
  confirmProductFields,
  fetchCertificateImage,
  fetchProduct,
  fetchTestReportImage,
  setProductFavorite,
} from '../../api/client';
import { useFocusLoad } from '../../features/useFocusLoad';
import { SkeletonDetail } from '../../components/Skeleton';
import {
  EmptyState,
  ErrorState,
  InlineError,
  friendlyMessage,
  isNotFound,
} from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { ImageViewerModal } from '../../components/ImageViewerModal';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { SectionHeader } from '../../components/SectionHeader';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProductGallery } from '../../components/ProductGallery';
import { PassportCard, toPassportCardProduct } from '../../components/PassportCard';
import {
  STOCK_UNIT_LABELS,
  finishTagLabel,
  isYarnType,
  usageLabel,
  yarnRoleLabel,
  yarnTypeLabel,
  yarnUnitLabel,
} from '../../features/products/catalog';
import { certificateLabel, effectiveWidthCm, fiberLabel } from '../../features/products/glossaryLabels';
import { optionLabel, otherCountLabels, useYarnOptions } from '../../features/yarns/catalog';
import { formatMeasure, toInputNumber } from '../../features/calculators/parse';
import { haptics } from '../../features/haptics';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

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

// Taslak: docs/tasarim-yonleri/CUrun.dc.html + orijinal tasarım "Ürün Sayfası"
// (kaydırmalı galeri, favori yıldızı). Galeri + kod bloğu, çizgili özellik
// satırları, firma satırı; eylemler ekranın altına sabit çubukta.
export function ProductDetailScreen({ route, navigation }: Props) {
  const { productId } = route.params;
  const { user } = useSession();
  const insets = useSafeAreaInsets();
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

  useEffect(() => {
    if (product) setFavorite(!!product.isFavorite);
  }, [product]);

  useEffect(() => {
    setFieldsConfirmed(false);
  }, [productId]);

  useEffect(() => {
    // Taslakta başlık ürün kodu, eşit aralıklı yazıyla.
    if (product) {
      navigation.setOptions({
        title: product.code,
        headerTitleStyle: { ...typography.heading, fontFamily: fonts.monoSemibold, color: colors.primaryText },
      });
    }
  }, [navigation, product]);

  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        <SkeletonDetail variant="product" />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
        {error && !isNotFound(error) ? (
          <ErrorState error={error} fallback="Ürün alınamadı" onRetry={reload} />
        ) : (
          <EmptyState icon="cube-outline" title="Ürün bulunamadı" message="Ürün kaldırılmış olabilir." />
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

  // --- Kumaş pasaportu ---
  const composition = product.composition ?? [];
  const compositionTotal = composition.reduce((sum, item) => sum + item.percent, 0);
  const finishTags = isYarn ? [] : product.finishTags ?? [];
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

  // Kart: kod, gramaj, en (+ en tipi), çeşit/alt çeşit, kompozisyon, stok,
  // MOQ ve termin, sertifika rozetleri. Aşağıdaki özet satırlarında bunlar
  // tekrar edilmiyor; kartta olmayanlar (kullanım, içerik metni, not) kalıyor.
  const passportCardProduct = toPassportCardProduct({ ...product, certificates });

  // Tek yüz tüp eninde kartta sığmayan hesap eni burada açıkça yazılır:
  // "80 cm tek yüz tüp eni · hesap eni 160 cm". Diğer durumlarda en yalnızca
  // pasaport kartında görünür (tekrar edilmez).
  const widthSpec =
    !isYarn && product.widthType === 'tup' && product.widthMeaning === 'tup_tek_yuz'
      ? `${formatMeasure(product.widthCm)} cm tek yüz tüp eni · hesap eni ${formatMeasure(
          product.effectiveWidthCm ?? effectiveWidthCm(product.widthCm, product.widthMeaning)
        )} cm`
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
      ]
    : [];

  // "30/1 Ne" kayıtlıysa diğer sistemlerdeki karşılığı küçük gri satırda.
  const otherCounts = yarnSpec ? otherCountLabels(yarnSpec.countDtex, yarnSpec.countUnit) : '';

  const specs: { label: string; value: string; sans?: boolean }[] = [
    ...(widthSpec ? [{ label: 'En', value: widthSpec }] : []),
    ...(usages ? [{ label: 'Kullanım', value: usages, sans: true }] : []),
    // Kompozisyon satırları varsa içerik metni ayrı blokta gösteriliyor.
    // İplikte özet zaten yukarıdaki iplik tablosunda; içerik metni tekrar olmaz.
    ...(composition.length || isYarn ? [] : [{ label: 'İçerik', value: product.content }]),
    ...(product.useArea ? [{ label: 'Not', value: product.useArea, sans: true }] : []),
  ];

  const commercial: { label: string; value: string }[] = [
    ...(product.moq != null
      ? [
          {
            label: 'En az sipariş',
            value: `${formatMeasure(product.moq)}${product.moqUnit ? ` ${STOCK_UNIT_LABELS[product.moqUnit].short}` : ''}`,
          },
        ]
      : []),
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

  const favoriteButton = isOwnProduct ? null : (
    <Pressable
      onPress={toggleFavorite}
      accessibilityRole="button"
      accessibilityState={{ selected: favorite }}
      accessibilityLabel={favorite ? 'Takipten çık' : 'Takibe al'}
      hitSlop={4}
      style={({ pressed }) => [styles.favoriteButton, pressed && styles.favoritePressed]}
    >
      <Ionicons
        name={favorite ? 'bookmark' : 'bookmark-outline'}
        size={22}
        color={favorite ? colors.primary : colors.text}
      />
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl(refreshing, refresh)}>
        {isOwnProduct && pendingFields.length ? (
          <View style={styles.pendingBanner} accessibilityRole="alert">
            <View style={styles.pendingTextWrap}>
              <Ionicons name="sparkles-outline" size={18} color={colors.warning} />
              <Text style={styles.pendingText}>
                Bu ürünün {pendingFields.map(fieldLabel).join(', ')} alanı metinden otomatik çıkarıldı. Doğru mu?
              </Text>
            </View>
            <View style={styles.pendingActions}>
              <PrimaryButton
                label={confirmBusy ? 'Onaylanıyor...' : 'Onayla'}
                onPress={confirmFields}
                disabled={confirmBusy}
                style={styles.pendingButton}
              />
              <PrimaryButton
                label="Düzenle"
                variant="outline"
                onPress={() => navigation.navigate('AddProduct', { productId: product.id })}
                style={styles.pendingButton}
              />
            </View>
          </View>
        ) : null}

        <View style={[styles.block, styles.heroBlock]}>
          <ProductGallery
            productId={product.id}
            imageCount={product.imageCount ?? (product.hasImage ? 1 : 0)}
            onOpenImage={setViewerUrl}
            overlay={favoriteButton}
          />
          {/* Akıştaki kartın aynısı; ürün sayfasında dokunulamaz (onPress yok).
              İplikte kumaş pasaportu kartı gösterilmez (gramaj/en 0). */}
          {isYarn ? (
            <View style={styles.yarnHead}>
              <Text style={styles.yarnCode}>{product.code}</Text>
              <Text style={styles.yarnSummary}>{yarnSpec?.summary || product.content}</Text>
            </View>
          ) : (
            <PassportCard product={passportCardProduct} />
          )}
        </View>

        {isYarn && yarnSpecs.length ? (
          <View>
            <SectionHeader title="İplik özellikleri" style={styles.sectionHeader} />
            <View style={[styles.block, styles.specBlock]}>
              {yarnSpecs.map((spec, index) => (
                <SpecRow
                  key={spec.label}
                  label={spec.label}
                  value={spec.value}
                  sans={spec.sans}
                  last={index === yarnSpecs.length - 1}
                />
              ))}
              {otherCounts ? <Text style={styles.passportNote}>Diğer birimlerde: {otherCounts}</Text> : null}
            </View>
          </View>
        ) : null}

        {specs.length ? (
          <View style={[styles.block, styles.specBlock]}>
            {specs.map((spec, index) => (
              <SpecRow
                key={spec.label}
                label={spec.label}
                value={spec.value}
                sans={spec.sans}
                last={index === specs.length - 1}
              />
            ))}
          </View>
        ) : null}

        {composition.length ? (
          <View>
            <SectionHeader title="Kompozisyon" style={styles.sectionHeader} />
            <View style={[styles.block, styles.passportBlock]}>
              {composition.map((item) => (
                <View key={`${item.fiber}-${item.percent}`} style={styles.fiberRow}>
                  <View style={styles.fiberTexts}>
                    <Text style={styles.fiberName}>{fiberLabel(item.fiber)}</Text>
                    <Text style={styles.fiberPercent}>%{formatMeasure(item.percent)}</Text>
                  </View>
                  <View style={styles.fiberTrack}>
                    <View style={[styles.fiberFill, { width: `${Math.min(100, item.percent)}%` }]} />
                  </View>
                </View>
              ))}
              {compositionTotal !== 100 ? (
                <Text style={styles.passportNote}>Toplam %{formatMeasure(compositionTotal)}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {commercial.length ? (
          <View>
            <SectionHeader title="Ticari" style={styles.sectionHeader} />
            <View style={[styles.block, styles.specBlock]}>
              {commercial.map((row, index) => (
                <SpecRow key={row.label} label={row.label} value={row.value} last={index === commercial.length - 1} />
              ))}
              {product.price ? <Text style={styles.passportNote}>Fiyatı yalnızca siz görüyorsunuz.</Text> : null}
            </View>
          </View>
        ) : null}

        {finishTags.length ? (
          <View>
            <SectionHeader title="Apre / boya" style={styles.sectionHeader} />
            <View style={[styles.block, styles.passportBlock]}>
              <View style={styles.tagRow}>
                {finishTags.map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText}>{finishTagLabel(tag)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : null}

        {certificates.length ? (
          <View>
            <SectionHeader title="Sertifikalar" count={certificates.length} style={styles.sectionHeader} />
            <View style={[styles.block, styles.passportBlock]}>
              {certificates.map((certificate, index) => {
                const meta = [
                  certificate.number ? `No ${certificate.number}` : '',
                  certificate.validUntil ? `${formatDocDate(certificate.validUntil)} tarihine kadar` : '',
                ]
                  .filter(Boolean)
                  .join(' · ');
                const body = (
                  <>
                    <Ionicons name="ribbon-outline" size={18} color={colors.success} />
                    <View style={styles.docTexts}>
                      <Text style={styles.docTitle}>{certificateLabel(certificate.name)}</Text>
                      {meta ? <Text style={styles.docMeta}>{meta}</Text> : null}
                    </View>
                    {certificate.hasImage ? <Ionicons name="image-outline" size={18} color={colors.chevron} /> : null}
                  </>
                );
                const divider = index < certificates.length - 1;
                return certificate.hasImage ? (
                  <Pressable
                    key={`${certificate.position}-${certificate.name}`}
                    onPress={() => openDocImage('certificate', certificate.position)}
                    accessibilityRole="button"
                    accessibilityLabel={`${certificateLabel(certificate.name)} belgesini aç`}
                    android_ripple={{ color: colors.pressed }}
                    style={({ pressed }) => [styles.docRow, divider && styles.docDivider, pressed && styles.pressed]}
                  >
                    {body}
                  </Pressable>
                ) : (
                  <View
                    key={`${certificate.position}-${certificate.name}`}
                    style={[styles.docRow, divider && styles.docDivider]}
                  >
                    {body}
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {yarns.length ? (
          <View>
            <SectionHeader title="İplik" count={yarns.length} style={styles.sectionHeader} />
            <View style={[styles.block, styles.passportBlock]}>
              {yarns.map((yarn, index) => (
                <View
                  key={yarn.position}
                  style={[styles.docRow, index < yarns.length - 1 && styles.docDivider]}
                >
                  <View style={styles.docTexts}>
                    <Text style={styles.docTitle}>{yarn.role ? yarnRoleLabel(yarn.role) : `${index + 1}. iplik`}</Text>
                    <Text style={styles.yarnValue}>{formatYarn(yarn)}</Text>
                  </View>
                  {/* Faz 2, Adım 6: iplik dizinini bu numarayla ön dolu açar.
                      Satırın YANINDA ayrı bir dokunma alanı (web'de iç içe
                      düğme olmasın). */}
                  <Pressable
                    onPress={() =>
                      navigation.navigate('YarnDirectory', {
                        preset: yarnDirectoryPreset(yarn),
                        presetKey: Date.now(),
                      })
                    }
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`${formatYarn(yarn)} ipliğini kimler satıyor, iplik dizininde ara`}
                    style={({ pressed }) => [styles.sellerLink, pressed && styles.assistantLinkPressed]}
                  >
                    <Text style={styles.sellerLinkText}>Kim satıyor?</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {testReports.length ? (
          <View>
            <SectionHeader title="Test raporları" count={testReports.length} style={styles.sectionHeader} />
            <View style={[styles.block, styles.passportBlock]}>
              {testReports.map((report, index) => {
                const meta = [report.result, formatDocDate(report.testedAt)].filter(Boolean).join(' · ');
                const divider = index < testReports.length - 1;
                const body = (
                  <>
                    <Ionicons name="document-text-outline" size={18} color={colors.accent} />
                    <View style={styles.docTexts}>
                      <Text style={styles.docTitle}>{report.kind}</Text>
                      {meta ? <Text style={styles.docMeta}>{meta}</Text> : null}
                    </View>
                    {report.hasImage ? <Ionicons name="image-outline" size={18} color={colors.chevron} /> : null}
                  </>
                );
                return report.hasImage ? (
                  <Pressable
                    key={report.position}
                    onPress={() => openDocImage('report', report.position)}
                    accessibilityRole="button"
                    accessibilityLabel={`${report.kind} raporunu aç`}
                    android_ripple={{ color: colors.pressed }}
                    style={({ pressed }) => [styles.docRow, divider && styles.docDivider, pressed && styles.pressed]}
                  >
                    {body}
                  </Pressable>
                ) : (
                  <View key={report.position} style={[styles.docRow, divider && styles.docDivider]}>
                    {body}
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {company ? (
          <Pressable
            onPress={openCompany}
            accessibilityRole="button"
            accessibilityLabel={`${company.name}, firma sayfasını aç`}
            android_ripple={{ color: colors.pressed }}
            style={({ pressed }) => [styles.block, styles.companyRow, pressed && styles.pressed]}
          >
            <CompanyAvatar
              name={company.name}
              verification={company.verification}
              size={36}
              companyId={company.id}
              logoUpdatedAt={company.logoUpdatedAt}
            />
            <View style={styles.companyTexts}>
              <Text style={styles.companyName} numberOfLines={1}>
                {company.name}
              </Text>
              <Text style={styles.companyMeta}>
                {company.verification === 'dogrulanmis' ? (
                  <Text style={styles.companyVerified}>Doğrulanmış üretici · </Text>
                ) : null}
                <Text style={styles.companyCount}>{product.companyProductCount} ürün</Text>
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.chevron} />
          </Pressable>
        ) : null}

        {/* Faz 2, Adım 3: firmanın asistanına bu ürünü sorma. Kendi ürününde
            gösterilmez. Satır firma satırının ALTINDA ayrı bir dokunma alanı:
            web'de iç içe düğme olmasın. */}
        {company && !isOwnProduct ? (
          <Pressable
            onPress={() =>
              navigation.navigate('SellerAssistant', {
                companyId: company.id,
                companyName: company.name,
                productCode: product.code,
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`${company.name} asistanına ${product.code} hakkında sor`}
            style={({ pressed }) => [styles.assistantLink, pressed && styles.assistantLinkPressed]}
          >
            <Ionicons name="sparkles" size={16} color={colors.assistant} />
            <Text style={styles.assistantLinkText}>Asistana sor</Text>
          </Pressable>
        ) : null}

        {error ? (
          <InlineError
            message={friendlyMessage(error, 'Ürün bilgisi yenilenemedi')}
            onRetry={reload}
            style={styles.banner}
          />
        ) : null}
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 10 }]}>
        {isOwnProduct ? (
          // Kendi ürününde "Firma" kendi firması; yerine ürünü akışta paylaşma.
          <PrimaryButton
            label="Paylaş"
            icon="share-social-outline"
            variant="outline"
            size="lg"
            accessibilityLabel="Bu ürünü gönderide paylaş"
            onPress={() => navigation.navigate('CreatePost', { productId: product.id })}
          />
        ) : (
          // Faz 2, Adım 2: alt çubuğun ikincil eylemi artık "Teklif iste".
          // Eski "Firma" düğmesi kalktı: 375px'lik telefonda üç `lg` düğme yan
          // yana sığmıyordu ve firmaya gidiş zaten çubuğun hemen üstündeki
          // firma satırından yapılıyor.
          <PrimaryButton
            label="Teklif iste"
            icon="pricetag-outline"
            variant="outline"
            size="lg"
            onPress={() =>
              navigation.navigate('QuoteRequestForm', {
                productId: product.id,
                productCode: product.code,
                stockUnit: product.stockUnit,
              })
            }
          />
        )}
        {isOwnProduct ? (
          <PrimaryButton
            label={isYarn ? 'İpliği Düzenle' : 'Ürünü Düzenle'}
            icon="create-outline"
            size="lg"
            // İplik kumaş formuyla düzenlenmez (sunucu 400 use_yarn_endpoint).
            onPress={() =>
              isYarn
                ? navigation.navigate('YarnForm', { yarnId: product.id })
                : navigation.navigate('AddProduct', { productId: product.id })
            }
            style={styles.actionMain}
          />
        ) : (
          <PrimaryButton
            label="Numune Talep Et"
            icon="cube-outline"
            size="lg"
            onPress={() =>
              navigation.navigate('SampleRequestForm', { productId: product.id, productCode: product.code })
            }
            style={styles.actionMain}
          />
        )}
      </View>

      <ImageViewerModal imageUrl={viewerUrl} visible={!!viewerUrl} onClose={() => setViewerUrl(null)} />
    </View>
  );
}

// sans: serbest metin (kullanım, not) eşit aralıklı yazıyla değil normal yazıyla.
function SpecRow({ label, value, last, sans }: { label: string; value: string; last?: boolean; sans?: boolean }) {
  return (
    <View style={[styles.specRow, !last && styles.specDivider]}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={[styles.specValue, sans && styles.specValueSans]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.md, gap: spacing.blockGap },
  block: { backgroundColor: colors.surface },
  heroBlock: { paddingHorizontal: spacing.gutter, paddingTop: 12, paddingBottom: spacing.gutter, gap: 12 },
  favoriteButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoritePressed: { backgroundColor: colors.pressed },
  specBlock: { paddingHorizontal: spacing.gutter, paddingVertical: spacing.xs },
  // Pasaport bölümleri: blok aralığı zaten gri boşluk, başlık üstü kısaltıldı.
  sectionHeader: { paddingTop: spacing.sm },
  passportBlock: { paddingHorizontal: spacing.gutter, paddingVertical: spacing.sm },
  // Kompozisyon: lif adı + oran, altında oranı gösteren ince çubuk.
  fiberRow: { paddingVertical: 6, gap: 4 },
  fiberTexts: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  fiberName: { ...typography.body, color: colors.text, flexShrink: 1 },
  fiberPercent: { ...typography.mono, fontFamily: fonts.monoMedium, fontSize: 16, color: colors.text },
  fiberTrack: { height: 4, borderRadius: radius.sm, backgroundColor: colors.surfaceTonal, overflow: 'hidden' },
  fiberFill: { height: 4, borderRadius: radius.sm, backgroundColor: colors.accent },
  passportNote: { ...typography.caption, color: colors.textMuted, paddingTop: spacing.xs },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: spacing.xs },
  tag: {
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: { ...typography.caption, fontFamily: fonts.medium, color: colors.primary },
  // Sertifika, iplik ve test raporu satırları.
  docRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH, paddingVertical: 6 },
  docDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  docTexts: { flex: 1, gap: 1 },
  docTitle: { ...typography.label, fontFamily: fonts.semibold, color: colors.text },
  docMeta: { ...typography.caption, color: colors.textMuted },
  yarnValue: { ...typography.mono, fontSize: 14, lineHeight: 19, color: colors.textMuted },
  // İplikte pasaport kartının yerini alan sade başlık bloğu.
  yarnHead: { gap: 2 },
  yarnCode: { ...typography.mono, fontFamily: fonts.monoSemibold, fontSize: 15, color: colors.primary },
  yarnSummary: { ...typography.subtitle, color: colors.text },
  // Kumaş pasaportundaki iplik satırının yanındaki "Kim satıyor?" bağlantısı.
  sellerLink: { minHeight: MIN_TOUCH, justifyContent: 'center', paddingLeft: spacing.sm },
  sellerLinkText: { ...typography.caption, fontFamily: fonts.semibold, color: colors.accent },
  // Çıkarımdan gelen alanlar için onay şeridi (yalnızca ürünün sahibine).
  pendingBanner: {
    backgroundColor: colors.warningSoft,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  pendingTextWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  pendingText: { ...typography.label, fontFamily: fonts.regular, color: colors.text, flex: 1 },
  pendingActions: { flexDirection: 'row', gap: spacing.sm },
  pendingButton: { flex: 1 },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 40,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  specDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  specLabel: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  specValue: {
    ...typography.mono,
    fontFamily: fonts.monoMedium,
    fontSize: 16,
    color: colors.text,
    flexShrink: 1,
    textAlign: 'right',
  },
  specValueSans: { ...typography.body, color: colors.text },
  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.gutter,
    paddingVertical: 10,
  },
  pressed: { backgroundColor: colors.pressed },
  // Asistan kızılı: yalnızca asistana giden bu bağlantıda (renk kuralı).
  assistantLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
  },
  assistantLinkPressed: { opacity: 0.6 },
  assistantLinkText: { ...typography.label, fontFamily: fonts.semibold, color: colors.assistant },
  companyTexts: { flex: 1 },
  companyName: { ...typography.bodyStrong, color: colors.text },
  companyMeta: { ...typography.caption },
  companyVerified: { fontFamily: fonts.medium, color: colors.accent },
  companyCount: { color: colors.textMuted },
  banner: { marginHorizontal: spacing.gutter },
  actionBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.gutter,
    paddingTop: 10,
  },
  actionMain: { flex: 1 },
});
