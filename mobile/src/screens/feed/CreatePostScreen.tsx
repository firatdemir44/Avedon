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
  ApiError,
  createPost,
  fetchMyProducts,
  fetchPost,
  fetchProduct,
  fetchLinkPreview,
  fetchPublicPostRule,
  updatePost,
  type PostLinkInput,
  type PostVisibility,
  type PublicPostRule,
} from '../../api/client';
import { setCachedPostImage } from '../../features/feed/postImageCache';
import { loadLinkImage, setCachedLinkImage } from '../../features/feed/postLinkImageCache';
import { LinkPreviewCard, hostOf } from '../../components/LinkPreviewCard';
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
// Metne yapıştırılan bağlantı yazma durduktan bu kadar sonra önizlenir.
const LINK_DEBOUNCE_MS = 700;

// Ekrandaki bağlantı kartı: önizleme gelmezse yalnızca adres + alan adı.
type LinkState = PostLinkInput & { hasImage: boolean; imageUri: string | null };

// Metindeki ilk http(s) bağlantısı (sondaki noktalama hariç).
function firstUrlIn(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!m) return null;
  const url = m[0].replace(/[),.;:!?]+$/, '');
  return /^https?:\/\/[^/\s]+\.[^/\s]+/i.test(url) ? url : null;
}

function normalizeUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  return /^https?:\/\/[^/\s]+\.[^/\s]+/i.test(withScheme) && !/\s/.test(withScheme) ? withScheme : null;
}

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
  // Herkese açık paylaşım hakkı (akış düzeni 2026-09-23): ekran açılınca ve ürün değişince sorulur.
  const [rule, setRule] = useState<PublicPostRule | null>(null);
  // Düzenlenen gönderinin ilk görünürlüğü: zaten herkese açık olan gönderi öyle kalabilir (sunucu da izin verir).
  const [originalVisibility, setOriginalVisibility] = useState<PostVisibility | null>(null);
  // Sunucu herkese açık paylaşımı reddettiyse (403/422) tek dokunuşla "Bağlantılarımla paylaş".
  const [offerConnections, setOfferConnections] = useState(false);
  // Paylaşılan bağlantı (fotoğraf/video ile birlikte olmaz).
  const [link, setLink] = useState<LinkState | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  // Düzenlemede bağlantıya dokunulmadıysa sunucuya gönderilmez.
  const [linkDirty, setLinkDirty] = useState(false);
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  const [linkDraftError, setLinkDraftError] = useState<string | null>(null);
  // Kullanıcının kaldırdığı adres metinde dursa da yeniden önizlenmez.
  const dismissedUrlRef = useRef<string | null>(null);
  const linkRequestRef = useRef(0);

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
        setOriginalVisibility(post.visibility);
        setProductId(post.product?.id ?? null);
        setExistingMedia(post.video ? 'video' : post.hasImage ? 'image' : null);
        if (post.link) {
          const existing = post.link;
          setLink({ ...existing, imageDataUrl: null, imageUri: null });
          if (existing.hasImage) {
            loadLinkImage(post.id)
              .then((uri) => {
                if (!cancelled) setLink((prev) => (prev && prev.url === existing.url ? { ...prev, imageUri: uri } : prev));
              })
              .catch(() => {
                // Görsel gelmezse yer tutucu kalır.
              });
          }
        }
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

  // Herkese açık hak: düzenlemede gönderi yüklendikten sonra (ürün bilinsin diye).
  useEffect(() => {
    if (loadingPost) return;
    let cancelled = false;
    fetchPublicPostRule({ productId, postId: editingPostId })
      .then(({ rule: next }) => {
        if (!cancelled) setRule(next);
      })
      .catch(() => {
        // Hak bilgisi gelmezse seçenek açık kalır; sunucu gönderimde yine denetler.
        if (!cancelled) setRule(null);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, editingPostId, loadingPost]);

  const keepsPublic = isEditing && originalVisibility === 'public';
  const publicLocked = !!rule && !rule.allowed && !keepsPublic;

  // Kilitliyse "Bağlantılarım" kendiliğinden seçilir.
  useEffect(() => {
    if (publicLocked) setVisibility('connections');
  }, [publicLocked]);

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

  // Bağlantı önizlemesi: önce alan adıyla boş kart, sonra sunucunun önizlemesi.
  const loadLinkPreview = useCallback(async (url: string) => {
    const request = ++linkRequestRef.current;
    setLinkDirty(true);
    setLinkLoading(true);
    setLink({ url, title: '', description: '', siteName: hostOf(url), imageDataUrl: null, hasImage: false, imageUri: null });
    try {
      const { preview } = await fetchLinkPreview(url);
      if (request !== linkRequestRef.current) return;
      setLink({
        url: preview.url,
        title: preview.title,
        description: preview.description,
        siteName: preview.siteName || hostOf(url),
        imageDataUrl: preview.imageDataUrl ?? null,
        hasImage: !!preview.imageDataUrl,
        imageUri: preview.imageDataUrl ?? null,
      });
    } catch {
      // Önizleme alınamadı: alan adlı sade kart kalır, yine paylaşılabilir.
    } finally {
      if (request === linkRequestRef.current) setLinkLoading(false);
    }
  }, []);

  const hasAnyMedia = !!imageDataUrl || !!videoUpload.video || !!existingMedia;

  // Metne yapıştırılan bağlantı: yazma durunca önizlenir (fotoğraf/video yoksa).
  useEffect(() => {
    if (loadingPost || link || hasAnyMedia) return;
    const url = firstUrlIn(body);
    if (!url || url === dismissedUrlRef.current) return;
    const timer = setTimeout(() => loadLinkPreview(url), LINK_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [body, link, hasAnyMedia, loadingPost, loadLinkPreview]);

  const removeLink = () => {
    haptics.selection();
    linkRequestRef.current++;
    if (link) dismissedUrlRef.current = link.url;
    setLink(null);
    setLinkLoading(false);
    setLinkDirty(true);
  };

  const submitLinkDraft = () => {
    const url = normalizeUrl(linkDraft);
    if (!url) {
      setLinkDraftError('Geçerli bir adres yazın (ör. https://site.com/haber).');
      return;
    }
    setLinkDraftError(null);
    setLinkInputOpen(false);
    setLinkDraft('');
    dismissedUrlRef.current = null;
    loadLinkPreview(url);
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

  const visibilityChoice: PostVisibility = publicLocked ? 'connections' : visibility;
  const uploadingVideo = videoUpload.uploading;
  const videoRef = videoUpload.uploadedRef;
  const hasMedia = !!imageDataUrl || !!video;
  const canSubmit = isEditing
    ? (body.trim().length > 0 || !!existingMedia || !!link) && !submitting && !loadingPost && !linkLoading
    : (body.trim().length > 0 || !!imageDataUrl || !!videoRef || !!link) && !submitting && !uploadingVideo && !linkLoading;
  const linkPayload: PostLinkInput | null = link
    ? { url: link.url, title: link.title, description: link.description, siteName: link.siteName, imageDataUrl: link.imageDataUrl ?? null }
    : null;

  const handleSubmit = async (overrideVisibility?: PostVisibility) => {
    if (!canSubmit) return;
    const visibility = overrideVisibility ?? visibilityChoice;
    if (overrideVisibility) setVisibility(overrideVisibility);
    setSubmitting(true);
    setError(null);
    setOfferConnections(false);
    try {
      if (editingPostId) {
        await updatePost(editingPostId, {
          body: body.trim(),
          visibility,
          productId,
          // Dokunulmayan bağlantı gönderilmez (görseli yeniden yüklenmesin).
          ...(linkDirty ? { link: linkPayload } : {}),
        });
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
        link: linkPayload ?? undefined,
      });
      // Video artık gönderiye bağlı; ekrandan çıkarken silinmesin.
      videoUpload.markAttached();
      markFeedStale();
      // Az önce yüklediğimiz fotoğrafı önbelleğe koyuyoruz ki akışa dönünce
      // tekrar indirilmesin.
      if (post.imageUrl) setCachedPostImage(post.id, post.imageUrl);
      if (link?.imageDataUrl) setCachedLinkImage(post.id, link.imageDataUrl);
      navigation.goBack();
    } catch (err) {
      // Herkese açık reddi: sunucunun açıklaması + "Bağlantılarımla paylaş".
      if (
        err instanceof ApiError &&
        (err.code === 'public_not_allowed' || err.code === 'not_textile') &&
        visibility === 'public'
      ) {
        const message = typeof err.body?.message === 'string' ? err.body.message : 'Bu gönderi herkese açık paylaşılamıyor.';
        setError(message);
        setOfferConnections(true);
        if (err.code === 'public_not_allowed' && err.body?.rule && typeof err.body.rule === 'object') {
          setRule(err.body.rule as PublicPostRule);
        }
        haptics.error();
        return;
      }
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

  const canAddLink = !link && !linkInputOpen && (isEditing ? !existingMedia : !hasMedia && !uploadingVideo);
  const linkSection = link ? (
    <LinkPreviewCard
      url={link.url}
      title={link.title}
      description={link.description}
      siteName={link.siteName}
      imageUri={link.imageUri}
      hasImage={link.hasImage}
      loading={linkLoading}
      onRemove={removeLink}
    />
  ) : linkInputOpen ? (
    <Card>
      <View style={{ gap: t.space[3] }}>
        <Input
          label="Bağlantı adresi"
          placeholder="https://…"
          value={linkDraft}
          onChangeText={(v) => {
            setLinkDraft(v);
            setLinkDraftError(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          onSubmitEditing={submitLinkDraft}
          error={linkDraftError ?? undefined}
          autoFocus
        />
        <View style={{ flexDirection: 'row', gap: t.space[2] }}>
          <Button
            kind="secondary"
            label="Vazgeç"
            onPress={() => {
              setLinkInputOpen(false);
              setLinkDraft('');
              setLinkDraftError(null);
            }}
            style={{ flex: 1 }}
          />
          <Button label="Ekle" icon="link-outline" onPress={submitLinkDraft} style={{ flex: 1 }} />
        </View>
      </View>
    </Card>
  ) : isEditing && canAddLink ? (
    <Button kind="secondary" label="Bağlantı ekle" icon="link-outline" fullWidth onPress={() => setLinkInputOpen(true)} />
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
            Bir gönderiye bir fotoğraf, en fazla {MAX_VIDEO_SECONDS} saniyelik bir video ya da bir haber/makale
            bağlantısı eklenebilir.
          </Text>
          {link ? (
            <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
              Gönderide bağlantı var; fotoğraf veya video eklemek için önce bağlantıyı kaldırın.
            </Text>
          ) : null}

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

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            {!video && !link ? (
              <Button
                kind="secondary"
                label={pickingImage ? 'İşleniyor…' : imageUri ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle'}
                icon="camera"
                disabled={pickingImage}
                onPress={pickImage}
                style={{ flex: 1 }}
              />
            ) : null}
            {!imageUri && !video && !link ? (
              <Button
                kind="secondary"
                label="Video ekle"
                icon="videocam-outline"
                onPress={pickAndUploadVideo}
                style={{ flex: 1 }}
              />
            ) : null}
            {canAddLink ? (
              <Button
                kind="secondary"
                label="Bağlantı"
                accessibilityLabel="Bağlantı ekle"
                icon="link-outline"
                onPress={() => setLinkInputOpen(true)}
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
            onPress={() => handleSubmit()}
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

        {linkSection}
        {productSection}
        {mediaSection}

        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="Kimler görebilir?" />
          <SegmentControl<PostVisibility>
            stretch
            accessibilityLabel="Görünürlük"
            value={visibilityChoice}
            onChange={(v) => {
              haptics.selection();
              setVisibility(v);
              setOfferConnections(false);
            }}
            options={[
              { value: 'public', label: publicLocked ? 'Herkese açık (kapalı)' : 'Herkese açık', disabled: publicLocked },
              { value: 'connections', label: 'Bağlantılarım' },
            ]}
          />
          {publicLocked && rule?.message ? (
            <View style={{ flexDirection: 'row', gap: t.space[2], alignItems: 'flex-start' }}>
              <Icon name="lock-closed-outline" size={t.size.iconSm} color="ink3" />
              <Text style={[t.type.body14, { color: t.colors.ink2, flex: 1, minWidth: 0 }]}>{rule.message}</Text>
            </View>
          ) : null}
          {publicLocked && rule?.reason === 'not_verified' ? (
            <Button
              kind="secondary"
              icon="shield-checkmark-outline"
              label="Firma doğrulama başvurusu"
              onPress={() => navigation.navigate('Verification')}
              fullWidth
            />
          ) : null}
          {!publicLocked && rule?.allowed && !keepsPublic && user?.companyId ? (
            <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
              Bugün kalan herkese açık paylaşım: {Math.max(0, rule.limitPerDay - rule.usedToday)}/{rule.limitPerDay}
            </Text>
          ) : null}
          <Text style={[t.type.caption12, { color: t.colors.ink3 }]}>
            Herkese açık akış yalnızca tekstille ilgili paylaşımlara açıktır.
          </Text>
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
        {offerConnections ? (
          <Button
            kind="secondary"
            icon="people-outline"
            label="Bağlantılarımla paylaş"
            loading={submitting}
            disabled={!canSubmit}
            onPress={() => handleSubmit('connections')}
            fullWidth
          />
        ) : null}
      </Screen>
    </View>
  );
}
