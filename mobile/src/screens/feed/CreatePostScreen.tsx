// Gönderi paylaşma / düzenleme ekranı (yeni tasarım, 4. adım — DESIGN.md §2–3).
// Veri katmanı değişmedi: aynı uçlar, aynı gövdeler, aynı rotalar. Yalnızca
// sunum yenilendi: AppBar + Screen(sticky) + ui/Input + ui/Card + ui/Button.
// Ham hex / ham px yok; her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
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
import { getCachedProductImage, loadProductImage } from '../../features/products/productImageCache';
import { categoryLabel } from '../../features/products/catalog';
import { haptics } from '../../features/haptics';
import { MAX_VIDEO_SECONDS } from '../../features/videoUpload';
import { formatVideoDuration, useVideoUpload } from '../../features/useVideoUpload';
import { useTheme } from '../../theme/ThemeContext';
import {
  AppBar,
  Button,
  Card,
  Icon,
  Input,
  Screen,
  SectionTitle,
  SegmentControl,
  SkeletonText,
} from '../../ui';

type Props = NativeStackScreenProps<RootStackParamList, 'CreatePost'>;

const MAX_BODY = 3000;

// DESIGN.md'de adı olmayan, yalnızca bu ekranda geçen ölçüler.
const BODY_MIN_HEIGHT = 120;
const PREVIEW_RATIO = 4 / 3;
const PROGRESS_HEIGHT = 6;

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
// geri bildirimi 2026-09-16). Burada yalnızca seçilen ürünün tek çipi duruyor.
export function CreatePostScreen({ navigation, route }: Props) {
  const t = useTheme();
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

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    if (!editingPostId) return;
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
  }, [editingPostId]);

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

  // Ürün çipindeki 32px görsel (liste yanıtında gelmiyor, tek tek çekiliyor).
  const [chipImage, setChipImage] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedProduct?.hasImage) {
      setChipImage(null);
      return;
    }
    const cached = getCachedProductImage(selectedProduct.id);
    if (cached) {
      setChipImage(cached);
      return;
    }
    let cancelled = false;
    loadProductImage(selectedProduct.id)
      .then((url) => {
        if (!cancelled) setChipImage(url);
      })
      .catch(() => {
        // Görsel gelmezse yer tutucu kalır.
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProduct?.id, selectedProduct?.hasImage]);

  // "Ürün seç" mi yoksa "önce ürün ekleyin" mi gösterileceğini belirler.
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

  const title = isEditing ? 'Gönderiyi düzenle' : 'Gönderi paylaş';
  const appBar = <AppBar title={title} leading="back" onBack={() => navigation.goBack()} />;

  if (loadingPost) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {appBar}
        <Screen>
          <SkeletonText lines={4} />
        </Screen>
      </View>
    );
  }

  // Ürün çipi (DESIGN.md §3 "Paylaşım kartı"): 32px görsel + ad + mono-14 kod.
  const productChip = selectedProduct ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: t.size.touchMin }}>
      <View
        style={{
          width: t.size.avatarSm,
          height: t.size.avatarSm,
          borderRadius: t.radius.sm,
          borderWidth: 1,
          borderColor: t.colors.line,
          backgroundColor: t.colors.surface2,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {chipImage ? (
          <Image source={{ uri: chipImage }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
        ) : (
          <Icon name="fabric" size={t.size.iconSm} color="ink3" />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[t.type.body16Strong, { color: t.colors.ink }]}>
          {categoryLabel(selectedProduct.type, selectedProduct.subtype)}
        </Text>
        <Text numberOfLines={1} style={[t.type.mono14, { color: t.colors.ink2 }]}>
          {selectedProduct.code}
        </Text>
      </View>
    </View>
  ) : null;

  // Firması olmayan (bireysel/alıcı) hesaplarda ürün bölümü hiç yok.
  const productSection = user?.companyId ? (
    <View style={{ gap: t.space[3] }}>
      <SectionTitle title="Ürün ekle (isteğe bağlı)" />
      <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
        Ürün eklerseniz gönderinizde ürünün ölçüleri ve "Talep et" düğmesi çıkar; alıcılar doğrudan numune
        isteyebilir.
      </Text>
      {selectedProduct ? (
        <Card>
          <View style={{ gap: t.space[3] }}>
            {productChip}
            <View style={{ flexDirection: 'row', gap: t.space[2] }}>
              <Button
                kind="secondary"
                label="Değiştir"
                accessibilityLabel="Başka ürün seç"
                onPress={openProductPicker}
                style={{ flex: 1 }}
              />
              <Button kind="secondary" label="Kaldır" onPress={clearProduct} style={{ flex: 1 }} />
            </View>
          </View>
        </Card>
      ) : productTotal === 0 ? (
        <Card>
          <View style={{ gap: t.space[3] }}>
            <Text style={[t.type.body16, { color: t.colors.ink2 }]}>Firmanızın henüz ürünü yok.</Text>
            <Button
              kind="secondary"
              label="Ürün ekle"
              icon="plus"
              fullWidth
              onPress={() => navigation.navigate('AddProduct')}
            />
          </View>
        </Card>
      ) : (
        <Button kind="secondary" label="Ürün seç" icon="fabric" fullWidth onPress={openProductPicker} />
      )}
      {!isEditing && selectedProduct?.hasImage && !hasMedia ? (
        <Button
          kind="secondary"
          label={usingProductPhoto ? 'Fotoğraf alınıyor…' : 'Ürün fotoğrafını gönderiye ekle'}
          icon="image-outline"
          fullWidth
          disabled={usingProductPhoto}
          onPress={useProductPhoto}
        />
      ) : null}
    </View>
  ) : null;

  const mediaSection = isEditing ? (
    <View style={{ gap: t.space[3] }}>
      <SectionTitle title="Fotoğraf veya video" />
      <Card>
        <View style={{ gap: t.space[2] }}>
          <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>
            {existingMedia === 'video'
              ? 'Gönderide video var'
              : existingMedia === 'image'
                ? 'Gönderide fotoğraf var'
                : 'Gönderide fotoğraf veya video yok'}
          </Text>
          <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
            Düzenlemede yazı, görünürlük ve ürün değiştirilebilir. Fotoğrafı ya da videoyu değiştirmek için
            gönderiyi silip yeniden paylaşın.
          </Text>
        </View>
      </Card>
    </View>
  ) : (
    <View style={{ gap: t.space[3] }}>
      <SectionTitle title="Fotoğraf veya video" />
      <Card>
        <View style={{ gap: t.space[3] }}>
          <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
            Bir gönderiye bir fotoğraf ya da en fazla {MAX_VIDEO_SECONDS} saniyelik bir video eklenebilir.
          </Text>

          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              resizeMode="cover"
              style={{
                width: '100%',
                aspectRatio: PREVIEW_RATIO,
                borderRadius: t.radius.md,
                borderWidth: 1,
                borderColor: t.colors.line,
                backgroundColor: t.colors.surface2,
              }}
            />
          ) : null}

          {video ? (
            <View style={{ gap: t.space[2] }}>
              <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>
                {video.phase === 'uploading'
                  ? video.progress >= 0.999
                    ? 'Yükleme tamamlanıyor, onay bekleniyor…'
                    : `Video yükleniyor %${Math.round(video.progress * 100)}`
                  : `Video yüklendi${video.durationSeconds != null ? ` · ${formatVideoDuration(video.durationSeconds)}` : ''}`}
              </Text>
              <View
                style={{
                  height: PROGRESS_HEIGHT,
                  borderRadius: t.radius.sm,
                  backgroundColor: t.colors.surface2,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    height: PROGRESS_HEIGHT,
                    backgroundColor: t.colors.accent,
                    width: `${Math.round((video.phase === 'uploading' ? video.progress : 1) * 100)}%`,
                  }}
                />
              </View>
              {video.phase === 'uploaded' ? (
                <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                  Paylaştıktan sonra kısa bir süre işlenir, sonra akışta izlenebilir.
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: t.space[2] }}>
            {!video ? (
              <Button
                kind="secondary"
                label={pickingImage ? 'İşleniyor…' : imageUri ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle'}
                icon="camera"
                disabled={pickingImage}
                onPress={pickImage}
                style={{ flex: 1 }}
              />
            ) : null}
            {!imageUri && !video ? (
              <Button
                kind="secondary"
                label="Video ekle"
                icon="videocam-outline"
                onPress={pickAndUploadVideo}
                style={{ flex: 1 }}
              />
            ) : null}
            {hasMedia && !uploadingVideo ? (
              <Button
                kind="secondary"
                label="Kaldır"
                onPress={() => {
                  if (video) {
                    videoUpload.remove();
                  } else {
                    setImageUri(null);
                    setImageDataUrl(null);
                  }
                }}
                style={{ flex: 1 }}
              />
            ) : null}
          </View>
        </View>
      </Card>
    </View>
  );

  const submitLabel = submitting
    ? isEditing
      ? 'Kaydediliyor…'
      : 'Paylaşılıyor…'
    : uploadingVideo
      ? 'Video yükleniyor…'
      : isEditing
        ? 'Kaydet'
        : 'Paylaş';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      {appBar}
      <Screen
        sticky={
          <Button
            size="lg"
            label={submitLabel}
            loading={submitting}
            disabled={!canSubmit}
            onPress={handleSubmit}
          />
        }
      >
        <Input
          label="Gönderi metni"
          placeholder="Ne paylaşmak istersiniz?"
          value={body}
          onChangeText={(text) => setBody(text.slice(0, MAX_BODY))}
          multiline
          textAlignVertical="top"
          helper={`${body.length} / ${MAX_BODY}`}
          containerStyle={{ minHeight: BODY_MIN_HEIGHT }}
        />

        {productSection}
        {mediaSection}

        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="Kimler görebilir?" />
          <SegmentControl<PostVisibility>
            stretch
            accessibilityLabel="Görünürlük"
            value={visibility}
            onChange={setVisibility}
            options={[
              { value: 'public', label: 'Herkese açık' },
              { value: 'connections', label: 'Bağlantılarım' },
            ]}
          />
        </View>

        {error ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.space[2],
              padding: t.space[3],
              borderRadius: t.radius.md,
              backgroundColor: t.colors.dangerSoft,
            }}
          >
            <Icon name="warning" size={t.size.iconSm} color="danger" />
            <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{error}</Text>
          </View>
        ) : null}
      </Screen>
    </View>
  );
}
