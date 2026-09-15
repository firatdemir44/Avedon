import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { TextField } from '../../components/TextField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useSession } from '../../context/SessionContext';
import { createProduct, updateProduct, deleteProduct, fetchProduct } from '../../api/client';
import { pickCompressedImage } from '../../features/imagePicker';
import { loadProductImage, setCachedProductImage } from '../../features/products/productImageCache';
import { parseNumber, toInputNumber } from '../../features/calculators/parse';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';
import type { ProductType } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'AddProduct'>;

const TYPE_OPTIONS: { value: ProductType; label: string }[] = [
  { value: 'raschel', label: 'Raschel' },
  { value: 'orme', label: 'Örme' },
  { value: 'dokuma', label: 'Dokuma' },
  { value: 'diger', label: 'Diğer' },
];

export function AddProductScreen({ navigation, route }: Props) {
  const { user } = useSession();
  const productId = route.params?.productId ?? null;
  const isEditing = !!productId;

  const [type, setType] = useState<ProductType>('orme');
  const [code, setCode] = useState('');
  const [stock, setStock] = useState('');
  const [weightGsm, setWeightGsm] = useState('');
  const [widthCm, setWidthCm] = useState('');
  const [content, setContent] = useState('');
  const [useArea, setUseArea] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [pickingImage, setPickingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    fetchProduct(productId)
      .then(({ product }) => {
        if (cancelled) return;
        setType(product.type);
        setCode(product.code);
        setStock(toInputNumber(product.stock));
        setWeightGsm(toInputNumber(product.weightGsm));
        setWidthCm(toInputNumber(product.widthCm));
        setContent(product.content);
        setUseArea(product.useArea);
        // Fotoğraf artık ürün yanıtında gelmiyor, ayrı uçtan çekiliyor
        // (bkz. features/imageCache.ts). Gelmezse önizleme boş kalır, kaydetme
        // sırasında da gönderilmez — yani mevcut fotoğraf silinmez.
        if (product.hasImage) {
          loadProductImage(productId)
            .then((url) => {
              if (cancelled) return;
              setImageUri(url);
              setImageDataUrl(url);
            })
            .catch(() => {});
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Ürün yüklenemedi');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const pickImage = async () => {
    setPickingImage(true);
    setError(null);
    try {
      const picked = await pickCompressedImage();
      if (!picked) return;
      setImageUri(picked.uri);
      setImageDataUrl(picked.dataUrl);
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

  const stockNum = parseNumber(stock);
  const weightGsmNum = parseNumber(weightGsm);
  const widthCmNum = parseNumber(widthCm);

  const canSubmit =
    !!user?.companyId &&
    code.trim().length > 0 &&
    content.trim().length > 0 &&
    useArea.trim().length > 0 &&
    stock.trim().length > 0 &&
    stockNum >= 0 &&
    weightGsm.trim().length > 0 &&
    weightGsmNum > 0 &&
    widthCm.trim().length > 0 &&
    widthCmNum > 0;

  const handleSubmit = async () => {
    if (!user?.companyId) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        code: code.trim(),
        type,
        stock: stockNum,
        weightGsm: weightGsmNum,
        widthCm: widthCmNum,
        content: content.trim(),
        useArea: useArea.trim(),
        imageUrl: imageDataUrl ?? undefined,
      };
      // Fotoğraf önbellekte tutuluyor; kaydedilen görseli oraya da yazmazsak
      // geri dönünce listede/detayda eski fotoğraf görünmeye devam ederdi.
      if (isEditing && productId) {
        await updateProduct(productId, payload);
        if (imageDataUrl) setCachedProductImage(productId, imageDataUrl);
      } else {
        const { product } = await createProduct(payload);
        if (imageDataUrl) setCachedProductImage(product.id, imageDataUrl);
      }
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ürün kaydedilemedi');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!productId) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteProduct(productId);
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ürün silinemedi');
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{isEditing ? 'Ürünü Düzenle' : 'Yeni Ürün / Kumaş Kartı'}</Text>

        <Text style={styles.label}>Ürün Fotoğrafı</Text>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.preview} />
        ) : (
          <View style={styles.previewPlaceholder}>
            <Text style={styles.previewPlaceholderText}>Fotoğraf yok</Text>
          </View>
        )}
        <PrimaryButton
          label={pickingImage ? 'İşleniyor...' : imageUri ? 'Fotoğrafı Değiştir' : 'Fotoğraf Seç'}
          onPress={pickImage}
          disabled={pickingImage}
          variant="secondary"
          style={{ marginBottom: spacing.lg }}
        />
        {pickingImage ? <ActivityIndicator color={colors.primary} style={{ marginBottom: spacing.md }} /> : null}

        <Text style={styles.label}>Kumaş Tipi</Text>
        <View style={styles.typeRow}>
          {TYPE_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => setType(option.value)}
              style={[styles.typeChip, type === option.value && styles.typeChipSelected]}
            >
              <Text style={[styles.typeChipText, type === option.value && styles.typeChipTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextField label="Ürün Kodu" value={code} onChangeText={setCode} placeholder="Örn. ORM-1042" />
        <TextField label="İçerik" value={content} onChangeText={setContent} placeholder="Örn. %95 Pamuk %5 Elastan" />
        <TextField label="Kullanım Alanı" value={useArea} onChangeText={setUseArea} placeholder="Örn. Spor Giyim" />
        <TextField
          label="Gramaj (gr/m²)"
          value={weightGsm}
          onChangeText={setWeightGsm}
          placeholder="Örn. 220"
          keyboardType="numeric"
        />
        <TextField label="En (cm)" value={widthCm} onChangeText={setWidthCm} placeholder="Örn. 150" keyboardType="numeric" />
        <TextField label="Stok (metre)" value={stock} onChangeText={setStock} placeholder="Örn. 1200" keyboardType="numeric" />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton
          label={submitting ? 'Kaydediliyor...' : isEditing ? 'Değişiklikleri Kaydet' : 'Ürünü Kaydet'}
          disabled={!canSubmit || submitting}
          onPress={handleSubmit}
        />

        {isEditing ? (
          <PrimaryButton
            label={deleting ? 'Siliniyor...' : confirmingDelete ? 'Emin misiniz? Yine bas, sil' : 'Ürünü Sil'}
            onPress={handleDelete}
            disabled={deleting}
            style={styles.deleteButton}
          />
        ) : null}
        {confirmingDelete ? (
          <PrimaryButton
            label="Vazgeç"
            variant="secondary"
            onPress={() => setConfirmingDelete(false)}
            style={{ marginTop: spacing.sm }}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.primary,
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.label,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceTonal,
  },
  previewPlaceholder: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceTonal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPlaceholderText: {
    ...typography.label,
    fontFamily: fonts.regular,
    color: colors.textMuted,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  typeChip: {
    minHeight: MIN_TOUCH - 8,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceTonal,
  },
  typeChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  typeChipText: {
    ...typography.label,
    fontFamily: fonts.medium,
    color: colors.text,
  },
  typeChipTextSelected: {
    color: colors.primaryText,
  },
  error: {
    ...typography.label,
    fontFamily: fonts.regular,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  deleteButton: {
    marginTop: spacing.md,
    backgroundColor: colors.danger,
  },
});
