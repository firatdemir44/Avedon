import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Image, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useSession } from '../../context/SessionContext';
import {
  ApiError,
  createPost,
  deleteVideo,
  fetchMyProducts,
  fetchPost,
  updatePost,
  type MyProductOption,
  type PostVisibility,
  type VideoRef,
} from '../../api/client';
import { setCachedPostImage } from '../../features/feed/postImageCache';
import { markFeedStale } from '../../features/feed/feedRefresh';
import { pickCompressedImage } from '../../features/imagePicker';
import { MAX_VIDEO_SECONDS, VideoPickError, pickVideo, uploadVideo } from '../../features/videoUpload';
import { MIN_TOUCH, colors, radius, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'CreatePost'>;

const MAX_BODY = 3000;

type VideoState =
  | { phase: 'uploading'; progress: number; durationSeconds: number | null }
  | { phase: 'uploaded'; ref: VideoRef; durationSeconds: number | null };

function formatDuration(seconds: number | null) {
  if (seconds == null) return '';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function videoErrorMessage(err: unknown) {
  if (err instanceof VideoPickError) {
    if (err.code === 'permission_denied') return 'Galeriye erişim izni verilmedi.';
    if (err.code === 'too_long') return `Video en fazla ${MAX_VIDEO_SECONDS} saniye olabilir.`;
    return 'Video dosyası çok büyük (en fazla 190 MB). Telefonun kamera ayarlarından video çözünürlüğünü 1080p\'ye düşürüp yeniden çekin.';
  }
  if (err instanceof ApiError) {
    if (err.code === 'video_not_configured') return 'Video paylaşımı henüz etkinleştirilmedi.';
    if (err.code === 'too_many_pending_uploads') return 'Yarım kalan çok fazla yükleme var, biraz sonra tekrar deneyin.';
  }
  return 'Video yüklenemedi, bağlantınızı kontrol edip tekrar deneyin.';
}

// Aynı ekran hem yeni gönderi hem düzenleme için. Düzenlemede yalnızca yazı,
// görünürlük ve ürün değişir; fotoğraf ve video sabit kalır (sunucu da izin vermez).
export function CreatePostScreen({ navigation, route }: Props) {
  const { user } = useSession();
  const editingPostId = route.params?.postId ?? null;
  const isEditing = !!editingPostId;

  const [body, setBody] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [video, setVideo] = useState<VideoState | null>(null);
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [products, setProducts] = useState<MyProductOption[]>([]);
  const [productId, setProductId] = useState<string | null>(null);
  const [existingMedia, setExistingMedia] = useState<'image' | 'video' | null>(null);
  const [loadingPost, setLoadingPost] = useState(isEditing);
  const [pickingImage, setPickingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Yüklenmiş ama paylaşılmamış video ekrandan çıkınca silinsin; yoksa ücretli
  // Cloudflare deposunda sahipsiz kalırdı.
  const unpostedVideoIdRef = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (unpostedVideoIdRef.current) {
        deleteVideo(unpostedVideoIdRef.current).catch(() => {});
      }
    };
  }, []);

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

  const pickAndUploadVideo = async () => {
    setError(null);
    let reservedId: string | null = null;
    try {
      const picked = await pickVideo();
      if (!picked) return;
      setVideo({ phase: 'uploading', progress: 0, durationSeconds: picked.durationSeconds });
      const ref = await uploadVideo(picked, {
        onProgress: (progress) =>
          setVideo((prev) => (prev?.phase === 'uploading' ? { ...prev, progress } : prev)),
        // Kayıt açılır açılmaz işaretleniyor: yükleme sırasında ekrandan çıkılırsa
        // ya da yükleme başarısız olursa Cloudflare'de sahipsiz kalmasın.
        onReserved: (reserved) => {
          reservedId = reserved.id;
          unpostedVideoIdRef.current = reserved.id;
        },
      });
      setVideo({ phase: 'uploaded', ref, durationSeconds: picked.durationSeconds });
    } catch (err) {
      if (reservedId) {
        deleteVideo(reservedId).catch(() => {});
        if (unpostedVideoIdRef.current === reservedId) unpostedVideoIdRef.current = null;
      }
      setVideo(null);
      setError(videoErrorMessage(err));
    }
  };

  const removeVideo = () => {
    if (unpostedVideoIdRef.current) {
      deleteVideo(unpostedVideoIdRef.current).catch(() => {});
      unpostedVideoIdRef.current = null;
    }
    setVideo(null);
  };

  const uploadingVideo = video?.phase === 'uploading';
  const videoRef = video?.phase === 'uploaded' ? video.ref : null;
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
      unpostedVideoIdRef.current = null;
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
                    : `Video yüklendi${video.durationSeconds != null ? ` · ${formatDuration(video.durationSeconds)}` : ''}`}
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
                      removeVideo();
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
