import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, Image, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useSession } from '../../context/SessionContext';
import { createPost, fetchMyProducts, type MyProductOption, type PostVisibility } from '../../api/client';
import { setCachedPostImage } from '../../features/feed/postImageCache';
import { pickCompressedImage } from '../../features/imagePicker';
import { MIN_TOUCH, colors, radius, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'CreatePost'>;

const MAX_BODY = 3000;

export function CreatePostScreen({ navigation }: Props) {
  const { user } = useSession();
  const [body, setBody] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [products, setProducts] = useState<MyProductOption[]>([]);
  const [productId, setProductId] = useState<string | null>(null);
  const [pickingImage, setPickingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user?.companyId) return;
      fetchMyProducts()
        .then(({ products: fetched }) => setProducts(fetched))
        .catch(() => {});
    }, [user?.companyId])
  );

  const pickImage = async () => {
    setPickingImage(true);
    setError(null);
    try {
      // Akış kartı ürün sayfasından küçük görünüyor, ürün fotoğraflarından biraz
      // daha agresif sıkıştırıyoruz.
      const picked = await pickCompressedImage(900, 0.5);
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

  const canSubmit = (body.trim().length > 0 || !!imageDataUrl) && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { post } = await createPost({
        body: body.trim() || undefined,
        imageUrl: imageDataUrl ?? undefined,
        productId: productId ?? undefined,
        visibility,
      });
      // Az önce yüklediğimiz fotoğrafı önbelleğe koyuyoruz ki akışa dönünce
      // tekrar indirilmesin.
      if (post.imageUrl) setCachedPostImage(post.id, post.imageUrl);
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gönderi paylaşılamadı');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextInput
          style={styles.bodyInput}
          placeholder="Ne paylaşmak istersiniz?"
          placeholderTextColor={colors.textMuted}
          value={body}
          onChangeText={(text) => setBody(text.slice(0, MAX_BODY))}
          multiline
        />
        <Text style={styles.counter}>
          {body.length} / {MAX_BODY}
        </Text>

        <Text style={styles.label}>Fotoğraf</Text>
        {imageUri ? <Image source={{ uri: imageUri }} style={styles.preview} /> : null}
        <View style={styles.imageActions}>
          <PrimaryButton
            label={pickingImage ? 'İşleniyor...' : imageUri ? 'Fotoğrafı Değiştir' : 'Fotoğraf Ekle'}
            variant="secondary"
            disabled={pickingImage}
            onPress={pickImage}
            style={styles.flexButton}
          />
          {imageUri ? (
            <PrimaryButton
              label="Kaldır"
              variant="secondary"
              onPress={() => {
                setImageUri(null);
                setImageDataUrl(null);
              }}
              style={styles.flexButton}
            />
          ) : null}
        </View>

        <Text style={styles.label}>Kimler görebilir?</Text>
        <View style={styles.chipRow}>
          {(
            [
              { value: 'public', label: 'Herkese Açık' },
              { value: 'connections', label: 'Sadece Bağlantılarım' },
            ] as { value: PostVisibility; label: string }[]
          ).map((option) => (
            <Pressable
              key={option.value}
              onPress={() => setVisibility(option.value)}
              style={[styles.chip, visibility === option.value && styles.chipSelected]}
            >
              <Text style={[styles.chipText, visibility === option.value && styles.chipTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {products.length > 0 ? (
          <>
            <Text style={styles.label}>Ürün ekle (opsiyonel)</Text>
            <Text style={styles.hint}>
              Ürün eklerseniz gönderinizde "Talep Et" butonu çıkar ve numune talebi alabilirsiniz.
            </Text>
            <View style={styles.chipRow}>
              {products.map((product) => (
                <Pressable
                  key={product.id}
                  onPress={() => setProductId((prev) => (prev === product.id ? null : product.id))}
                  style={[styles.chip, productId === product.id && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, productId === product.id && styles.chipTextSelected]}>
                    {product.code}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton
          label={submitting ? 'Paylaşılıyor...' : 'Paylaş'}
          disabled={!canSubmit}
          onPress={handleSubmit}
          style={{ marginTop: spacing.md }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  bodyInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    backgroundColor: colors.surfaceTonal,
    color: colors.text,
    textAlignVertical: 'top',
  },
  counter: { ...typography.caption, color: colors.textMuted, alignSelf: 'flex-end', marginTop: spacing.xs },
  label: {
    ...typography.label,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  hint: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceTonal,
  },
  imageActions: { flexDirection: 'row', gap: spacing.sm },
  flexButton: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: MIN_TOUCH - 8,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceTonal,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipText: { ...typography.label, color: colors.text },
  chipTextSelected: { color: colors.primaryText },
  error: { ...typography.label, fontWeight: '400', color: colors.danger, marginTop: spacing.md },
});
