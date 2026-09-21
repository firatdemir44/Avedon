import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Image, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProductThumbnail } from '../../components/ProductThumbnail';
import { useSession } from '../../context/SessionContext';
import {
  createPost,
  fetchMyProducts,
  fetchPost,
  fetchProduct,
  updatePost,
  type PostVisibility,
} from '../../api/client';
import { setCachedPostImage } from '../../features/feed/postImageCache';
import { markFeedStale } from '../../features/feed/feedRefresh';
import { pickCompressedImage } from '../../features/imagePicker';
import { loadProductImage } from '../../features/products/productImageCache';
import { categoryLabel } from '../../features/products/catalog';
import { haptics } from '../../features/haptics';
import { MAX_VIDEO_SECONDS } from '../../features/videoUpload';
import { formatVideoDuration, useVideoUpload } from '../../features/useVideoUpload';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'CreatePost'>;

const MAX_BODY = 3000;

// Seçili ürünün ekranda gösterilen özeti.
interface SelectedProduct {
  id: string;
  code: string;
  type: string;
  subtype: string;
  hasImage: boolean;
}

// Aynı ekran hem yeni gönderi hem düzenleme için. Düzenlemede yalnızca yazı,
// görünürlük ve ürün değişir; fotoğraf ve video sabit kalır (sunucu da izin vermez).
//
// Ürün seçimi ayrı ekranda (SelectProduct): firmaların yüzlerce kumaşı olacağı
// için ürünleri burada listelemek ekranı kullanılmaz hale getiriyordu (kullanıcı
// geri bildirimi 2026-09-16). Burada yalnızca seçilen ürünün tek satırı duruyor.
export function CreatePostScreen({ navigation, route }: Props) {
  const { user } = useSession();
  const editingPostId = route.params?.postId ?? null;
  const isEditing = !!editingPostId;

  const [body, setBody] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [productId, setProductId] = useState<string | null>(route.params?.productId ?? null);
  const [selectedProduct, setSelectedProduct] = useState<SelectedProduct | null>(null);
  // Firmanın hiç ürünü var mı (yalnızca sayı çekiliyor, liste değil).
  const [productTotal, setProductTotal] = useState<number | null>(null);
  const [existingMedia, setExistingMedia] = useState<'image' | 'video' | null>(null);
  const [loadingPost, setLoadingPost] = useState(isEditing);
  const [pickingImage, setPickingImage] = useState(false);
  const [usingProductPhoto, setUsingProductPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seçme, yükleme, ilerleme ve paylaşılmadan çıkılınca temizleme ortak
  // kancada (ürün sayfası ve sohbet de aynısını kullanıyor).
  const videoUpload = useVideoUpload({ onError: setError });
  const video = videoUpload.video;

  useEffect(() => {
    if (!editingPostId) return;
    navigation.setOptions({ title: 'Gönderiyi Düzenle' });
    let cancelled = false;
    fetchPost(editingPostId)
      .then(({ post }) => {
        if (cancelled) return;
        setBody(post.body);
        setVisibility(post.visibility);
        setProductId(post.product?.id ?? null);
        setExistingMedia(post.video ? 'video' : post.hasImage ? 'image' : null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gönderi yüklenemedi');
      })
      .finally(() => {
        if (!cancelled) setLoadingPost(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editingPostId, navigation]);

  // Seçim ekranından (ya da ürün sayfasındaki "Paylaş"tan) dönüş. pickedAt
  // olmadan aynı ürün ikinci kez seçilince parametre değişmezdi.
  const paramProductId = route.params?.productId;
  const paramPickedAt = route.params?.pickedAt;
  const appliedPickRef = useRef<number | null>(null);
  useEffect(() => {
    if (!paramProductId) return;
    const stamp = paramPickedAt ?? 0;
    if (appliedPickRef.current === stamp) return;
    appliedPickRef.current = stamp;
    setProductId(paramProductId);
  }, [paramProductId, paramPickedAt]);

  // Seçili ürünün özeti (kod, çeşit, fotoğrafı var mı).
  useEffect(() => {
    if (!productId) {
      setSelectedProduct(null);
      return;
    }
    if (selectedProduct?.id === productId) return;
    let cancelled = false;
    fetchProduct(productId)
      .then(({ product }) => {
        if (cancelled) return;
        setSelectedProduct({
          id: product.id,
          code: product.code,
          type: product.type,
          subtype: product.subtype ?? '',
          hasImage: product.hasImage,
        });
      })
      .catch(() => {
        // Ürün silinmiş olabilir: seçim düşer, gönderi ürünsüz paylaşılır.
        if (!cancelled) setProductId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, selectedProduct?.id]);

  // "Ürün Seç" mi yoksa "önce ürün ekleyin" mi gösterileceğini belirler.
  useFocusEffect(
    useCallback(() => {
      if (!user?.companyId) return;
      let cancelled = false;
      fetchMyProducts(undefined, 1)
        .then(({ total }) => {
          if (!cancelled) setProductTotal(total);
        })
        .catch(() => {
          if (!cancelled) setProductTotal((prev) => prev ?? 0);
        });
      return () => {
        cancelled = true;
      };
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

  // Seçilen ürünün kapak fotoğrafı gönderi fotoğrafı olur (ürün fotoğrafı
  // zaten sıkıştırılmış data URL; yeniden yüklemek gerekmiyor).
  const useProductPhoto = async () => {
    if (!productId) return;
    setUsingProductPhoto(true);
    setError(null);
    try {
      const url = await loadProductImage(productId);
      setImageUri(url);
      setImageDataUrl(url);
      haptics.selection();
    } catch {
      setError('Ürün fotoğrafı alınamadı, galeriden fotoğraf seçebilirsiniz.');
    } finally {
      setUsingProductPhoto(false);
    }
  };

  const pickAndUploadVideo = async () => {
    setError(null);
    await videoUpload.pickAndUpload();
  };

  const openProductPicker = () =>
    navigation.navigate('SelectProduct', { selectedId: productId ?? undefined });

  const clearProduct = () => {
    haptics.selection();
    appliedPickRef.current = null;
    setProductId(null);
  };

  const uploadingVideo = videoUpload.uploading;
  const videoRef = videoUpload.uploadedRef;
  const hasMedia = !!imageDataUrl || !!video;
  const canSubmit = isEditing
    ? (body.trim().length > 0 || !!existingMedia) && !submitting && !loadingPost
    : (body.trim().length > 0 || !!imageDataUrl || !!videoRef) && !submitting && !uploadingVideo;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      if (editingPostId) {
        await updatePost(editingPostId, { body: body.trim(), visibility, productId });
        markFeedStale();
        navigation.goBack();
        return;
      }

      const { post } = await createPost({
        body: body.trim() || undefined,
        imageUrl: imageDataUrl ?? undefined,
        videoId: videoRef?.id,
        productId: productId ?? undefined,
        visibility,
      });
      // Video artık gönderiye bağlı; ekrandan çıkarken silinmesin.
      videoUpload.markAttached();
      markFeedStale();
      // Az önce yüklediğimiz fotoğrafı önbelleğe koyuyoruz ki akışa dönünce
      // tekrar indirilmesin.
      if (post.imageUrl) setCachedPostImage(post.id, post.imageUrl);
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : isEditing ? 'Değişiklikler kaydedilemedi' : 'Gönderi paylaşılamadı');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingPost) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  // Firması olmayan (bireysel/alıcı) hesaplarda ürün bölümü hiç yok.
  const productSection = user?.companyId ? (
    <>
      <Text style={styles.label}>Ürün ekle (isteğe bağlı)</Text>
      <Text style={styles.hint}>
        Ürün eklerseniz gönderinizde ürünün ölçüleri ve "Talep Et" düğmesi çıkar; alıcılar doğrudan numune isteyebilir.
      </Text>
      {selectedProduct ? (
        <View style={styles.selectedBox}>
          <View style={styles.selectedRow}>
            <ProductThumbnail productId={selectedProduct.id} hasImage={selectedProduct.hasImage} size={44} />
            <View style={styles.selectedTexts}>
              <Text style={styles.selectedCode}>{selectedProduct.code}</Text>
              <Text style={styles.selectedMeta}>{categoryLabel(selectedProduct.type, selectedProduct.subtype)}</Text>
            </View>
          </View>
          <View style={styles.selectedActions}>
            <PrimaryButton
              label="Değiştir"
              variant="outline"
              onPress={openProductPicker}
              style={styles.flexButton}
              accessibilityLabel="Başka ürün seç"
            />
            <PrimaryButton label="Kaldır" variant="secondary" onPress={clearProduct} style={styles.flexButton} />
          </View>
        </View>
      ) : productTotal === 0 ? (
        <View style={styles.emptyProducts}>
          <Text style={styles.emptyProductsText}>Firmanızın henüz ürünü yok.</Text>
          <PrimaryButton label="Ürün Ekle" icon="add" variant="outline" onPress={() => navigation.navigate('AddProduct')} />
        </View>
      ) : (
        <PrimaryButton label="Ürün Seç" icon="cube-outline" variant="outline" onPress={openProductPicker} />
      )}
      {!isEditing && selectedProduct?.hasImage && !hasMedia ? (
        <PrimaryButton
          label={usingProductPhoto ? 'Fotoğraf alınıyor...' : 'Ürün fotoğrafını gönderiye ekle'}
          icon="image-outline"
          variant="secondary"
          disabled={usingProductPhoto}
          onPress={useProductPhoto}
          style={styles.productPhotoButton}
        />
      ) : null}
    </>
  ) : null;

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

        {productSection}

        {isEditing ? (
          <View style={styles.videoBox}>
            <Text style={styles.videoTitle}>
              {existingMedia === 'video'
                ? 'Gönderide video var'
                : existingMedia === 'image'
                  ? 'Gönderide fotoğraf var'
                  : 'Gönderide fotoğraf veya video yok'}
            </Text>
            <Text style={styles.hint}>
              Düzenlemede yazı, görünürlük ve ürün değiştirilebilir. Fotoğrafı ya da videoyu değiştirmek için gönderiyi silip yeniden paylaşın.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.label}>Fotoğraf veya video</Text>
            <Text style={styles.hint}>
              Bir gönderiye bir fotoğraf ya da en fazla {MAX_VIDEO_SECONDS} saniyelik bir video eklenebilir.
            </Text>

            {imageUri ? <Image source={{ uri: imageUri }} style={styles.preview} /> : null}

            {video ? (
              <View style={styles.videoBox}>
                <Text style={styles.videoTitle}>
                  {video.phase === 'uploading'
                    ? video.progress >= 0.999
                      ? 'Yükleme tamamlanıyor, Cloudflare onayı bekleniyor...'
                      : `Video yükleniyor %${Math.round(video.progress * 100)}`
                    : `Video yüklendi${video.durationSeconds != null ? ` · ${formatVideoDuration(video.durationSeconds)}` : ''}`}
                </Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.round((video.phase === 'uploading' ? video.progress : 1) * 100)}%` },
                    ]}
                  />
                </View>
                {video.phase === 'uploaded' ? (
                  <Text style={styles.hint}>Paylaştıktan sonra kısa bir süre işlenir, sonra akışta izlenebilir.</Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.imageActions}>
              {!video ? (
                <PrimaryButton
                  label={pickingImage ? 'İşleniyor...' : imageUri ? 'Fotoğrafı Değiştir' : 'Fotoğraf Ekle'}
                  variant="secondary"
                  disabled={pickingImage}
                  onPress={pickImage}
                  style={styles.flexButton}
                />
              ) : null}
              {!imageUri && !video ? (
                <PrimaryButton label="Video Ekle" variant="secondary" onPress={pickAndUploadVideo} style={styles.flexButton} />
              ) : null}
              {hasMedia && !uploadingVideo ? (
                <PrimaryButton
                  label="Kaldır"
                  variant="secondary"
                  onPress={() => {
                    if (video) {
                      videoUpload.remove();
                    } else {
                      setImageUri(null);
                      setImageDataUrl(null);
                    }
                  }}
                  style={styles.flexButton}
                />
              ) : null}
            </View>
          </>
        )}

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

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton
          label={
            submitting
              ? isEditing
                ? 'Kaydediliyor...'
                : 'Paylaşılıyor...'
              : uploadingVideo
                ? 'Video yükleniyor...'
                : isEditing
                  ? 'Kaydet'
                  : 'Paylaş'
          }
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
    fontFamily: fonts.regular,
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 17,
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
  selectedBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
  },
  selectedTexts: { flex: 1, gap: 1 },
  selectedCode: { ...typography.monoStrong, color: colors.primary },
  selectedMeta: { ...typography.caption, color: colors.textMuted },
  selectedActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.sm,
  },
  productPhotoButton: { marginTop: spacing.sm },
  emptyProducts: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  emptyProductsText: { ...typography.body, color: colors.textMuted },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceTonal,
  },
  videoBox: {
    backgroundColor: colors.surfaceTonal,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  videoTitle: { ...typography.bodyStrong, color: colors.text },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: colors.accent },
  imageActions: { flexDirection: 'row', gap: spacing.sm },
  flexButton: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: MIN_TOUCH - 8,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceTonal,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipText: { ...typography.label, color: colors.text },
  chipTextSelected: { color: colors.primaryText },
  error: { ...typography.label, fontFamily: fonts.regular, color: colors.danger, marginTop: spacing.md },
});
