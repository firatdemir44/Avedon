import React, { useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { TextField } from '../../components/TextField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useSession } from '../../context/SessionContext';
import { createProduct } from '../../api/client';
import { pickCompressedImage } from '../../features/imagePicker';
import { colors, radius, spacing } from '../../theme';
import type { ProductType } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'AddProduct'>;

const TYPE_OPTIONS: { value: ProductType; label: string }[] = [
  { value: 'raschel', label: 'Raschel' },
  { value: 'orme', label: 'Örme' },
  { value: 'dokuma', label: 'Dokuma' },
  { value: 'diger', label: 'Diğer' },
];

export function AddProductScreen({ navigation }: Props) {
  const { user } = useSession();
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
  const [error, setError] = useState<string | null>(null);

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

  const canSubmit =
    !!user?.companyId &&
    code.trim().length > 0 &&
    content.trim().length > 0 &&
    useArea.trim().length > 0 &&
    Number(stock) >= 0 &&
    Number(weightGsm) > 0 &&
    Number(widthCm) > 0;

  const handleSubmit = async () => {
    if (!user?.companyId) return;
    setSubmitting(true);
    setError(null);
    try {
      await createProduct({
        companyId: user.companyId,
        code: code.trim(),
        type,
        stock: Number(stock),
        weightGsm: Number(weightGsm),
        widthCm: Number(widthCm),
        content: content.trim(),
        useArea: useArea.trim(),
        imageUrl: imageDataUrl ?? undefined,
      });
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ürün eklenemedi');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Yeni Ürün / Kumaş Kartı</Text>

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
          label={submitting ? 'Kaydediliyor...' : 'Ürünü Kaydet'}
          disabled={!canSubmit || submitting}
          onPress={handleSubmit}
        />
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
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  previewPlaceholder: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPlaceholderText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  typeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  typeChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  typeChipText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  typeChipTextSelected: {
    color: colors.primaryText,
  },
  error: {
    fontSize: 13,
    color: colors.danger,
    marginBottom: spacing.md,
  },
});
