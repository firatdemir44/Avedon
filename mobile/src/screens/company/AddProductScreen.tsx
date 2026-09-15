import React, { useEffect, useLayoutEffect, useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import { TextField } from '../../components/TextField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ChipSelect } from '../../components/ChipSelect';
import { MultiChipSelect } from '../../components/MultiChipSelect';
import { SectionHeader } from '../../components/SectionHeader';
import { ListRow } from '../../components/ListRow';
import { useSession } from '../../context/SessionContext';
import {
  createProduct,
  deleteProduct,
  fetchProduct,
  updateProduct,
  type ProductImageInput,
} from '../../api/client';
import { pickCompressedImage } from '../../features/imagePicker';
import {
  getCachedGalleryImage,
  loadGalleryImage,
  replaceCachedProductImages,
} from '../../features/products/productImageCache';
import { MAX_PRODUCT_IMAGES } from '../../features/products/limits';
import {
  PRODUCT_TYPES,
  STOCK_UNITS,
  STOCK_UNIT_LABELS,
  SUBTYPES,
  TYPE_LABELS,
  USAGES,
  type ProductType,
  type StockUnit,
} from '../../features/products/catalog';
import { parseNumber, toInputNumber } from '../../features/calculators/parse';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { colors, fonts, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'AddProduct'>;

// existing: sunucudaki fotoğrafın eski sırası (kaydederken yeniden yüklenmez).
// dataUrl: yeni seçilen fotoğraf.
interface PhotoItem {
  key: string;
  uri: string | null;
  dataUrl: string | null;
  existing?: number;
}

const TYPE_OPTIONS = PRODUCT_TYPES.map((value) => ({ value, label: TYPE_LABELS[value] }));
const UNIT_OPTIONS = STOCK_UNITS.map((value) => ({
  value,
  label: value === 'm' ? 'Metre (m)' : 'Kilogram (kg)',
}));
const PHOTO_SIZE = 96;

let photoSeq = 0;
const newPhotoKey = () => `yeni-${++photoSeq}`;

// Ürün kartı formu (Aşama A): çoklu fotoğraf, çeşit → alt çeşit, kullanım
// amaçları, metre/kg stok. Pazar Masası düzeni: gri zemin üstünde başlıklı
// beyaz bloklar, altta sabit kaydet çubuğu.
export function AddProductScreen({ navigation, route }: Props) {
  const { user } = useSession();
  const insets = useSafeAreaInsets();
  const productId = route.params?.productId ?? null;
  const isEditing = !!productId;

  const [type, setType] = useState<ProductType>('orme');
  const [subtype, setSubtype] = useState('');
  const [usages, setUsages] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [stock, setStock] = useState('');
  const [stockUnit, setStockUnit] = useState<StockUnit>('m');
  const [weightGsm, setWeightGsm] = useState('');
  const [widthCm, setWidthCm] = useState('');
  const [content, setContent] = useState('');
  const [useArea, setUseArea] = useState('');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [photosDirty, setPhotosDirty] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: isEditing ? 'Ürünü Düzenle' : 'Ürün Ekle' });
  }, [navigation, isEditing]);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    fetchProduct(productId)
      .then(({ product }) => {
        if (cancelled) return;
        setType(product.type);
        setSubtype(product.subtype ?? '');
        setUsages(product.usages ?? []);
        setCode(product.code);
        setStock(toInputNumber(product.stock));
        setStockUnit(product.stockUnit ?? 'm');
        setWeightGsm(toInputNumber(product.weightGsm));
        setWidthCm(toInputNumber(product.widthCm));
        setContent(product.content);
        setUseArea(product.useArea);
        const count = product.imageCount ?? (product.hasImage ? 1 : 0);
        setPhotos(
          Array.from({ length: count }, (_, i) => ({
            key: `mevcut-${i}`,
            existing: i,
            dataUrl: null,
            uri: getCachedGalleryImage(productId, i) ?? null,
          }))
        );
        // Mevcut fotoğraflar yalnızca önizleme için çekiliyor; kaydederken
        // sıraları gönderiliyor, kendileri yeniden yüklenmiyor.
        for (let i = 0; i < count; i++) {
          if (getCachedGalleryImage(productId, i)) continue;
          loadGalleryImage(productId, i)
            .then((url) => {
              if (cancelled) return;
              setPhotos((prev) => prev.map((p) => (p.existing === i && !p.uri ? { ...p, uri: url } : p)));
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) setError('Ürün yüklenemedi, lütfen tekrar deneyin.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const changeType = (next: ProductType) => {
    setType(next);
    // Alt çeşit yalnızca kendi çeşidinde geçerli.
    if (!SUBTYPES[next].some((s) => s.key === subtype)) setSubtype('');
  };

  const addPhoto = async () => {
    if (photos.length >= MAX_PRODUCT_IMAGES) return;
    setPickingImage(true);
    setError(null);
    try {
      const picked = await pickCompressedImage();
      if (!picked) return;
      setPhotos((prev) => [...prev, { key: newPhotoKey(), uri: picked.uri, dataUrl: picked.dataUrl }]);
      setPhotosDirty(true);
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'permission_denied'
          ? 'Galeriye erişim izni verilmedi.'
          : 'Fotoğraf işlenemedi, lütfen başka bir fotoğraf deneyin.'
      );
    } finally {
      setPickingImage(false);
    }
  };

  const removePhoto = (key: string) => {
    haptics.selection();
    setPhotos((prev) => prev.filter((p) => p.key !== key));
    setPhotosDirty(true);
  };

  const makeCover = (key: string) => {
    haptics.selection();
    setPhotos((prev) => {
      const target = prev.find((p) => p.key === key);
      return target ? [target, ...prev.filter((p) => p.key !== key)] : prev;
    });
    setPhotosDirty(true);
  };

  const stockNum = parseNumber(stock);
  const weightGsmNum = parseNumber(weightGsm);
  const widthCmNum = parseNumber(widthCm);
  // Mevcut fotoğraflardan biri henüz yüklenmediyse önizleme boş ama sırası
  // biliniyor; kaydetmeyi engellemez.
  const canSubmit =
    !!user?.companyId &&
    code.trim().length > 0 &&
    content.trim().length > 0 &&
    stock.trim().length > 0 &&
    stockNum >= 0 &&
    weightGsm.trim().length > 0 &&
    weightGsmNum > 0 &&
    widthCm.trim().length > 0 &&
    widthCmNum > 0;

  const handleSubmit = async () => {
    if (!user?.companyId || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    const fields = {
      code: code.trim(),
      type,
      subtype,
      usages,
      stock: stockNum,
      stockUnit,
      weightGsm: weightGsmNum,
      widthCm: widthCmNum,
      content: content.trim(),
      useArea: useArea.trim(),
    };
    try {
      if (isEditing && productId) {
        const images: ProductImageInput[] | undefined = photosDirty
          ? photos.map((p) => (p.existing !== undefined ? { existing: p.existing } : p.dataUrl!))
          : undefined;
        await updateProduct(productId, images ? { ...fields, images } : fields);
        // Fotoğraflar yeniden sıralanmış olabilir: önbellekteki eski sıralar atılıyor.
        if (photosDirty) replaceCachedProductImages(productId, photos.map((p) => p.dataUrl ?? p.uri));
      } else {
        const { product } = await createProduct({ ...fields, images: photos.map((p) => p.dataUrl!) });
        replaceCachedProductImages(product.id, photos.map((p) => p.dataUrl));
      }
      haptics.success();
      navigation.goBack();
    } catch {
      haptics.error();
      setError('Ürün kaydedilemedi. Bilgileri kontrol edip tekrar deneyin.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!productId) return;
    const confirmed = await confirmAction({
      title: 'Ürünü sil',
      message: `${code || 'Bu ürün'} silinsin mi? Ürüne gelen numune talepleri de silinir.`,
      confirmLabel: 'Sil',
      destructive: true,
    });
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteProduct(productId);
      haptics.success();
      // Ürün sayfasından gelindiyse o sayfa artık boş: ikisi birden kapanır.
      const routes = navigation.getState().routes;
      if (routes[routes.length - 2]?.name === 'ProductDetail') navigation.pop(2);
      else navigation.goBack();
    } catch {
      haptics.error();
      setError('Ürün silinemedi, lütfen tekrar deneyin.');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </View>
    );
  }

  const subtypeOptions = [
    { value: '', label: 'Belirtilmemiş' },
    ...SUBTYPES[type].map((s) => ({ value: s.key, label: s.label })),
  ];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SectionHeader title={`Fotoğraflar (${photos.length}/${MAX_PRODUCT_IMAGES})`} first />
        <View style={styles.block}>
          <View style={styles.photoGrid}>
            {photos.map((photo, index) => (
              <View key={photo.key} style={styles.photoTile}>
                <Pressable
                  onPress={() => index > 0 && makeCover(photo.key)}
                  disabled={index === 0}
                  // Yanındaki kaldır düğmesiyle kardeş (iç içe değil): web'de
                  // iç içe <button> oluşmasın.
                  accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
                  accessibilityLabel={index === 0 ? `Fotoğraf ${index + 1}, kapak` : `Fotoğraf ${index + 1}, kapak yap`}
                  style={({ pressed }) => [styles.photoPress, pressed && styles.photoPressed]}
                >
                  {photo.uri ? (
                    <Image source={{ uri: photo.uri }} style={styles.photo} />
                  ) : (
                    <View style={[styles.photo, styles.photoLoading]}>
                      <ActivityIndicator color={colors.chevron} />
                    </View>
                  )}
                </Pressable>
                {index === 0 ? (
                  <View style={styles.coverBadge} pointerEvents="none">
                    <Text style={styles.coverBadgeText}>Kapak</Text>
                  </View>
                ) : null}
                <Pressable
                  onPress={() => removePhoto(photo.key)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Fotoğraf ${index + 1}, kaldır`}
                  style={({ pressed }) => [styles.removeButton, pressed && styles.removePressed]}
                >
                  <Ionicons name="close" size={16} color={colors.primaryText} />
                </Pressable>
              </View>
            ))}
            {photos.length < MAX_PRODUCT_IMAGES ? (
              <Pressable
                onPress={addPhoto}
                disabled={pickingImage}
                accessibilityRole="button"
                accessibilityLabel="Fotoğraf ekle"
                style={({ pressed }) => [styles.addTile, pressed && styles.photoPressed]}
              >
                {pickingImage ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    <Ionicons name="add" size={26} color={colors.primary} />
                    <Text style={styles.addTileText}>Fotoğraf</Text>
                  </>
                )}
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.hint}>
            İlk fotoğraf kapak olur. Başka bir fotoğrafı kapak yapmak için üstüne dokunun.
          </Text>
        </View>

        <SectionHeader title="Kumaş" />
        <View style={[styles.block, styles.formBlock]}>
          <Text style={styles.label}>Çeşit</Text>
          <ChipSelect options={TYPE_OPTIONS} value={type} onChange={changeType} />
          {SUBTYPES[type].length > 0 ? (
            <>
              <Text style={styles.label}>Alt çeşit</Text>
              <ChipSelect options={subtypeOptions} value={subtype} onChange={setSubtype} compact />
            </>
          ) : null}
          <Text style={styles.label}>Kullanım amaçları</Text>
          <Text style={styles.labelHint}>Birden fazla seçebilirsiniz; alıcılar bu başlıklarla arıyor.</Text>
          <MultiChipSelect options={USAGES} values={usages} onChange={setUsages} />
        </View>

        <SectionHeader title="Bilgiler" />
        <View style={[styles.block, styles.formBlock]}>
          <TextField label="Ürün Kodu" value={code} onChangeText={setCode} placeholder="Örn. ORM-1042" />
          <TextField label="İçerik" value={content} onChangeText={setContent} placeholder="Örn. %95 Pamuk %5 Elastan" />
          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <TextField
                label="Gramaj (gr/m²)"
                value={weightGsm}
                onChangeText={setWeightGsm}
                placeholder="Örn. 220"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.fieldHalf}>
              <TextField label="En (cm)" value={widthCm} onChangeText={setWidthCm} placeholder="Örn. 150" keyboardType="numeric" />
            </View>
          </View>
          <Text style={styles.label}>Stok birimi</Text>
          <ChipSelect options={UNIT_OPTIONS} value={stockUnit} onChange={setStockUnit} compact />
          <TextField
            label={`Stok (${STOCK_UNIT_LABELS[stockUnit].long})`}
            value={stock}
            onChangeText={setStock}
            placeholder={stockUnit === 'm' ? 'Örn. 1200' : 'Örn. 450'}
            keyboardType="numeric"
          />
          <TextField
            label="Not (isteğe bağlı)"
            value={useArea}
            onChangeText={setUseArea}
            placeholder="Örn. Şardonlu, yıkamalı"
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {isEditing ? (
          <View style={[styles.block, styles.deleteBlock]}>
            <ListRow
              title={deleting ? 'Siliniyor...' : 'Ürünü Sil'}
              tone="danger"
              chevron={false}
              divider={false}
              onPress={deleting ? undefined : handleDelete}
            />
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 10 }]}>
        <PrimaryButton
          label={submitting ? 'Kaydediliyor...' : isEditing ? 'Değişiklikleri Kaydet' : 'Ürünü Kaydet'}
          size="lg"
          disabled={!canSubmit || submitting || deleting}
          onPress={handleSubmit}
          style={styles.actionMain}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  block: { backgroundColor: colors.surface },
  formBlock: { paddingHorizontal: spacing.gutter, paddingTop: spacing.gutter },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.gutter,
  },
  photoTile: { width: PHOTO_SIZE, height: PHOTO_SIZE },
  photoPress: { borderRadius: radius.md, overflow: 'hidden' },
  photoPressed: { opacity: 0.8 },
  photo: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: radius.md, backgroundColor: colors.surfaceTonal },
  photoLoading: { alignItems: 'center', justifyContent: 'center' },
  coverBadge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  coverBadgeText: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.primaryText },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(17,26,34,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePressed: { backgroundColor: colors.danger },
  addTile: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addTileText: { ...typography.label, fontFamily: fonts.semibold, color: colors.primary },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
  },
  label: { ...typography.label, fontFamily: fonts.semibold, color: colors.text, marginBottom: spacing.xs },
  labelHint: { ...typography.caption, color: colors.textMuted, marginTop: -2, marginBottom: spacing.sm },
  fieldRow: { flexDirection: 'row', gap: spacing.sm },
  fieldHalf: { flex: 1 },
  error: {
    ...typography.label,
    fontFamily: fonts.regular,
    color: colors.danger,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
  },
  deleteBlock: { marginTop: spacing.lg },
  actionBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.gutter,
    paddingTop: 10,
  },
  actionMain: { flex: 1 },
});
