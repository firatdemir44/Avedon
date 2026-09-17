import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { PostVideo } from '../../components/PostVideo';
import { PrimaryButton } from '../../components/PrimaryButton';
import { PassportCard, toPassportCardProduct } from '../../components/PassportCard';
import { formatRelativeTime } from '../../features/time';
import { getCachedPostImage, loadPostImage } from '../../features/feed/postImageCache';
import { getCachedProductImage, loadProductImage } from '../../features/products/productImageCache';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { ApiError, requestQuote, sendConnectionRequest, setProductFavorite, type FeedPost } from '../../api/client';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

interface Props {
  post: FeedPost;
  isMine: boolean;
  // Kullanıcının firması: kendi firmasının ürününde "Teklif iste" gösterilmez
  // (sunucu da 400 own_product döner).
  myCompanyId?: string | null;
  onToggleLike: (post: FeedPost) => void;
  onOpenComments: (post: FeedPost) => void;
  // Pasaport kartı → ürün sayfası; "Numune talep et" → numune talep formu.
  onOpenProduct: (post: FeedPost) => void;
  onRequestSample: (post: FeedPost) => void;
  onOpenAuthor: (post: FeedPost) => void;
  onShare: (post: FeedPost) => void;
  onEdit: (post: FeedPost) => void;
  onDelete: (post: FeedPost) => void;
  // "Teklif iste" sohbeti açtıktan sonra: (conversationId, başlık).
  // Verilmezse düğme gösterilmez.
  onOpenChat?: (conversationId: string, title: string) => void;
}

// Taslak: docs/tasarim-2027/Main.dc.html. Kenardan kenara beyaz blok:
// yazar satırı → görsel → kumaş pasaportu kartı → metin → eylem çubuğu.
// Ürünlü gönderide eylemler ticari: Numune talep et · Takibe al · Teklif iste
// (+ yorum). Beğeni yalnızca ürünsüz duyurularda (Faz 1, Adım 6 kararı).
function PostCardComponent({
  post,
  isMine,
  myCompanyId,
  onToggleLike,
  onOpenComments,
  onOpenProduct,
  onRequestSample,
  onOpenAuthor,
  onShare,
  onEdit,
  onDelete,
  onOpenChat,
}: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(
    post.imageUrl ?? getCachedPostImage(post.id) ?? null
  );
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!post.hasImage || imageUrl) return;
    let cancelled = false;
    loadPostImage(post.id)
      .then((url) => {
        if (!cancelled) setImageUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [post.id, post.hasImage, imageUrl]);

  // Gönderide kendi fotoğrafı ya da videosu yoksa ürünün kapak fotoğrafı
  // gösteriliyor (kullanıcı geri bildirimi 2026-09-16: "ürün resmi akışta
  // görünmüyor"). Fotoğraf listede gelmiyor, burada tek tek çekiliyor.
  const productWithImage = !post.hasImage && !post.video && post.product?.hasImage ? post.product : null;
  const [productImageUrl, setProductImageUrl] = useState<string | null>(() =>
    productWithImage ? getCachedProductImage(productWithImage.id) ?? null : null
  );

  useEffect(() => {
    if (!productWithImage) {
      setProductImageUrl(null);
      return;
    }
    const cached = getCachedProductImage(productWithImage.id);
    if (cached) {
      setProductImageUrl(cached);
      return;
    }
    let cancelled = false;
    loadProductImage(productWithImage.id)
      .then((url) => {
        if (!cancelled) setProductImageUrl(url);
      })
      .catch(() => {
        // Fotoğraf gelmezse kart ölçü şeridiyle devam eder.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productWithImage?.id]);

  const company = post.author.company;
  const authorName = `${post.author.firstName} ${post.author.lastName}`;
  const product = post.product;

  // "Takibe Al" = ProductFavorite kaydı. İyimser: düğme hemen değişir, sunucu
  // reddederse eski haline döner.
  const [following, setFollowing] = useState(!!product?.isFavorite);
  const [followBusy, setFollowBusy] = useState(false);
  useEffect(() => {
    setFollowing(!!post.product?.isFavorite);
  }, [post.product?.id, post.product?.isFavorite]);

  const toggleFollow = async () => {
    if (!product || followBusy) return;
    const next = !following;
    setFollowing(next);
    setFollowBusy(true);
    haptics.light();
    try {
      const result = await setProductFavorite(product.id, next);
      setFollowing(result.isFavorite);
    } catch {
      setFollowing(!next);
      haptics.error();
    } finally {
      setFollowBusy(false);
    }
  };

  // "Teklif iste": sunucu bağlantılı bir kişiyle sohbet açıp ürün kodlu mesajı
  // gönderir. Bağlantı yoksa 403 + suggestedUserId gelir, bağlantı isteği
  // önerilir. Sonuç kart içinde sarı/yeşil küçük kutuda kalır.
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteNotice, setQuoteNotice] = useState<{ text: string; done?: boolean } | null>(null);

  const requestQuoteForPost = async () => {
    if (!product || quoteBusy) return;
    setQuoteBusy(true);
    setQuoteNotice(null);
    try {
      const result = await requestQuote(product.id);
      haptics.success();
      onOpenChat?.(result.conversationId, company?.name ?? authorName);
    } catch (err) {
      const apiError = err instanceof ApiError ? err : null;
      const code = apiError?.code;
      if (apiError?.status === 403 && code === 'not_connected') {
        const suggestedUserId = typeof apiError.body?.suggestedUserId === 'string' ? apiError.body.suggestedUserId : null;
        if (!suggestedUserId) {
          setQuoteNotice({ text: 'Teklif için önce bu firmadan biriyle bağlantı kurmanız gerekiyor.' });
        } else {
          const confirmed = await confirmAction({
            title: 'Bağlantı gerekiyor',
            message: 'Teklif için önce bağlantı kurmanız gerekiyor. Bağlantı isteği gönderilsin mi?',
            confirmLabel: 'İstek gönder',
          });
          if (confirmed) {
            try {
              await sendConnectionRequest(suggestedUserId);
              haptics.success();
              setQuoteNotice({ text: 'Bağlantı isteği gönderildi. Kabul edilince teklif isteyebilirsiniz.', done: true });
            } catch {
              haptics.error();
              setQuoteNotice({ text: 'Bağlantı isteği gönderilemedi. Kişinin profilinden tekrar deneyebilirsiniz.' });
            }
          }
        }
      } else if (code === 'no_contact') {
        setQuoteNotice({ text: 'Bu firmada iletişim kurulabilecek bir kişi bulunamadı.' });
      } else {
        haptics.error();
        setQuoteNotice({ text: 'Teklif isteği gönderilemedi, lütfen tekrar deneyin.' });
      }
    } finally {
      setQuoteBusy(false);
    }
  };

  // Kendi firmasının ürününe teklif istenmez (sunucu 400 own_product).
  const isOwnProduct = !!product && !!myCompanyId && product.companyId === myCompanyId;
  const canRequestQuote = !!product && !isOwnProduct && !!onOpenChat;

  const meta = [
    post.author.position,
    formatRelativeTime(post.createdAt),
    post.visibility === 'connections' ? 'Bağlantılarım' : null,
    post.editedAt ? 'düzenlendi' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => onOpenAuthor(post)}
          accessibilityRole="button"
          accessibilityLabel={`${authorName}${company ? `, ${company.name}` : ''}, profili aç`}
          style={({ pressed }) => [styles.author, pressed && styles.pressedFade]}
        >
          <CompanyAvatar
            name={company?.name ?? post.author.firstName}
            verification={company?.verification}
            companyId={company?.id}
            logoUpdatedAt={company?.logoUpdatedAt}
            size={36}
          />
          <View style={styles.authorTexts}>
            <Text style={styles.authorLine} numberOfLines={1}>
              <Text style={styles.authorName}>{authorName}</Text>
              {company ? <Text style={styles.authorCompany}> · {company.name}</Text> : null}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {meta}
            </Text>
          </View>
        </Pressable>
        {isMine ? (
          <Pressable
            onPress={() => setMenuOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel="Gönderi seçenekleri"
            accessibilityState={{ expanded: menuOpen }}
            style={({ pressed }) => [styles.menuButton, pressed && styles.pressedBg]}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {menuOpen ? (
        <View style={styles.ownerMenu}>
          <OwnerAction icon="create-outline" label="Düzenle" onPress={() => onEdit(post)} />
          <OwnerAction icon="trash-outline" label="Sil" danger onPress={() => onDelete(post)} />
        </View>
      ) : null}

      {/* Görsel metinden önce: kaydırırken görsel gecikmesin. */}
      {post.video ? (
        <PostVideo key={post.video.id} video={post.video} />
      ) : post.hasImage ? (
        imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            resizeMode="cover"
            accessibilityLabel={`${authorName} gönderisinin fotoğrafı`}
          />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Ionicons name="image-outline" size={24} color={colors.chevron} />
          </View>
        )
      ) : productWithImage ? (
        productImageUrl ? (
          <Pressable
            onPress={() => onOpenProduct(post)}
            accessibilityRole="button"
            accessibilityLabel={`${productWithImage.code} ürün fotoğrafı, ürün sayfasını aç`}
            style={({ pressed }) => pressed && styles.pressedImage}
          >
            <Image source={{ uri: productImageUrl }} style={styles.image} resizeMode="cover" />
          </Pressable>
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Ionicons name="image-outline" size={24} color={colors.chevron} />
          </View>
        )
      ) : null}

      {product ? (
        <PassportCard product={toPassportCardProduct(product)} onPress={() => onOpenProduct(post)} />
      ) : null}

      {post.body ? <Text style={styles.body}>{post.body}</Text> : null}

      {quoteNotice ? (
        <View style={[styles.notice, quoteNotice.done && styles.noticeDone]} accessibilityRole="alert">
          <Ionicons
            name={quoteNotice.done ? 'checkmark-circle-outline' : 'alert-circle-outline'}
            size={16}
            color={quoteNotice.done ? colors.success : colors.warning}
          />
          <Text style={[styles.noticeText, quoteNotice.done && styles.noticeTextDone]}>{quoteNotice.text}</Text>
        </View>
      ) : null}

      {product ? (
        <View style={styles.actionBar}>
          {/* Taslakta düğmenin bir de kutu ikonu var; 375px'lik telefonda dört
              eylem yan yana sığmadığı ve yazı kırpıldığı için ikon düştü,
              yazının tamamı kaldı. */}
          <PrimaryButton
            label="Numune talep et"
            size="sm"
            onPress={() => onRequestSample(post)}
            accessibilityLabel={`${product.code} için numune talep et`}
            style={styles.sampleButton}
          />
          <PrimaryButton
            label={following ? 'Takipte' : 'Takibe al'}
            icon={following ? 'bookmark' : 'bookmark-outline'}
            size="sm"
            variant={following ? 'primary' : 'outline'}
            onPress={toggleFollow}
            accessibilityLabel={following ? `${product.code} takipten çık` : `${product.code} takibe al`}
          />
          {canRequestQuote ? (
            <Pressable
              onPress={requestQuoteForPost}
              disabled={quoteBusy}
              accessibilityRole="button"
              accessibilityLabel="Teklif iste"
              accessibilityState={{ disabled: quoteBusy }}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressedBg, quoteBusy && styles.disabled]}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
            </Pressable>
          ) : null}
          <CountAction
            icon="chatbubble-outline"
            count={post.commentCount}
            label="Yorumlar"
            onPress={() => onOpenComments(post)}
            style={styles.commentAction}
            hitSlop={8}
          />
        </View>
      ) : (
        <View style={styles.actionBar}>
          <CountAction
            icon={post.likedByMe ? 'heart' : 'heart-outline'}
            count={post.likeCount}
            active={post.likedByMe}
            label={post.likedByMe ? 'Beğeniyi geri al' : 'Beğen'}
            onPress={() => onToggleLike(post)}
          />
          <CountAction
            icon="chatbubble-outline"
            count={post.commentCount}
            label="Yorumlar"
            onPress={() => onOpenComments(post)}
          />
          <CountAction icon="arrow-redo-outline" label="Paylaş" onPress={() => onShare(post)} />
        </View>
      )}
    </View>
  );
}

function CountAction({
  icon,
  count,
  label,
  active,
  onPress,
  style,
  hitSlop,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  count?: number;
  label: string;
  active?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  // Dar eylem çubuğunda düğme küçülür, dokunma alanı hitSlop ile 44'te kalır.
  hitSlop?: number;
}) {
  const color = active ? colors.accent : colors.textMuted;
  const showCount = count !== undefined && count > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={showCount ? `${label}, ${count}` : label}
      accessibilityState={active !== undefined ? { selected: active } : undefined}
      hitSlop={hitSlop}
      style={({ pressed }) => [styles.countAction, style, pressed && styles.pressedFade]}
    >
      <Ionicons name={icon} size={20} color={color} />
      {showCount ? <Text style={[styles.countText, { color }]}>{count}</Text> : null}
    </Pressable>
  );
}

function OwnerAction({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const color = danger ? colors.danger : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Gönderiyi ${label.toLocaleLowerCase('tr-TR')}`}
      style={({ pressed }) => [styles.ownerAction, pressed && styles.pressedBg]}
    >
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.ownerActionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

export const PostCard = React.memo(PostCardComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
    paddingTop: 12,
    paddingBottom: spacing.xs,
    gap: 10,
  },
  pressedFade: { opacity: 0.6 },
  pressedImage: { opacity: 0.9 },
  pressedBg: { backgroundColor: colors.pressed },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  author: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: MIN_TOUCH },
  authorTexts: { flex: 1, minWidth: 0 },
  authorLine: { ...typography.bodyStrong, color: colors.text },
  authorName: { fontFamily: fonts.semibold },
  authorCompany: { fontFamily: fonts.regular, color: colors.textMuted },
  meta: { ...typography.caption, color: colors.textMuted },
  menuButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    marginRight: -10,
  },
  ownerMenu: { flexDirection: 'row', gap: spacing.sm },
  ownerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  ownerActionText: { ...typography.label, fontFamily: fonts.semibold },
  image: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTonal,
  },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  body: { ...typography.body, color: colors.text },
  // Teklif isteğinin sonucu: kart içinde kalan küçük sarı (ya da başarıda
  // yeşil) kutu. Web'de pencere yok, bu yüzden geri bildirim ekran içinde.
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: spacing.sm,
  },
  noticeDone: { backgroundColor: colors.successSoft },
  noticeText: { ...typography.caption, color: colors.warning, flexShrink: 1 },
  noticeTextDone: { color: colors.success },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 52,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  sampleButton: { flexShrink: 1, flexGrow: 1, minWidth: 0 },
  iconButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  disabled: { opacity: 0.4 },
  countAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: MIN_TOUCH,
    minWidth: MIN_TOUCH,
    paddingRight: spacing.gutter,
  },
  // Ürünlü gönderide yorum düğmesi sağ uçta: sağ boşluğu düğmelerin hizasına
  // çekiyoruz, yoksa kartın kenarından içeride kalıyor.
  commentAction: { justifyContent: 'center', minWidth: 32, paddingRight: 0 },
  countText: { ...typography.label, fontFamily: fonts.semibold },
});
