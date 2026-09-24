// Paylaşım kartı (yeni tasarım, 3. adım — DESIGN.md §3 "Paylaşım kartı").
//
// surface-1 kart, radius-lg, 1px line, iç boşluk yok (bölümler kendi boşluğunu
// taşır). Üst satır: 40px firma logosu karesi + firma adı + doğrulanmış rozeti,
// altında "Kişi · Görev · zaman", sağda 44px "daha fazla". Metin body-16,
// 3 satırdan uzunsa "…devamı". İsteğe bağlı görsel. Ürün bağlıysa 44px ürün
// çipi. Alt satır 44px, üst kenarlık line, 3 eşit eylem.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
// İkincil eylemler (Takibe al, Teklif iste, Düzenle, Sil, Paylaş) "daha fazla"
// menüsünde: DESIGN.md alt satırda TAM 3 eylem istiyor.
import React, { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { tenderBadge, tenderMetaLine } from '../../features/tenders/format';
import { TenderAttachmentLine, TenderCoverThumb } from '../../components/TenderCover';
import { PostVideo } from '../../components/PostVideo';
import { LinkPreviewCard } from '../../components/LinkPreviewCard';
import { getCachedLinkImage, loadLinkImage } from '../../features/feed/postLinkImageCache';
import { formatRelativeTime } from '../../features/time';
import { getCachedPostImage, loadPostImage } from '../../features/feed/postImageCache';
import { getCachedProductImage, loadProductImage } from '../../features/products/productImageCache';
import { companyLogoKey, getCachedCompanyLogo, loadCompanyLogo } from '../../features/companies/companyLogoCache';
import { haptics } from '../../features/haptics';
import { setProductFavorite, startConversation, type FeedPost } from '../../api/client';
import { useTheme } from '../../theme/ThemeContext';
import { ReportPostSheet } from './ReportPostSheet';
import { Avatar, Badge, Card, Icon, type AnyIconName } from '../../ui';

interface Props {
  post: FeedPost;
  isMine: boolean;
  /** Kendi firmasının ürününde "Teklif iste" gösterilmez (sunucu 400 own_product). */
  myCompanyId?: string | null;
  onToggleLike: (post: FeedPost) => void;
  onOpenComments: (post: FeedPost) => void;
  onOpenProduct: (post: FeedPost) => void;
  onRequestSample: (post: FeedPost) => void;
  onOpenAuthor: (post: FeedPost) => void;
  onShare: (post: FeedPost) => void;
  onEdit: (post: FeedPost) => void;
  onDelete: (post: FeedPost) => void;
  onRequestQuote?: (post: FeedPost) => void;
  /** Başkasının gönderisinde "Bu firmayı akışımda gizle" (yalnızca ana akış verir). */
  onMuteCompany?: (post: FeedPost) => void;
}

const BODY_LINES = 3;

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
  onRequestQuote,
  onMuteCompany,
}: Props) {
  const t = useTheme();
  // Açık talep gönderisi: kart iki çağıran ekranda da (akış, firma sayfası)
  // aynı yere gitsin diye gezinti burada.
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tender = post.tender ?? null;
  const openTender = () => {
    if (tender) navigation.navigate('TenderDetail', { tenderId: tender.id });
  };
  const [imageUrl, setImageUrl] = useState<string | null>(
    post.imageUrl ?? getCachedPostImage(post.id) ?? null
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

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

  // Gönderide kendi fotoğrafı/videosu yoksa ürünün kapak fotoğrafı gösterilir.
  const productWithImage = !post.hasImage && !post.video && !post.link && post.product?.hasImage ? post.product : null;
  const [productImageUrl, setProductImageUrl] = useState<string | null>(() =>
    productWithImage ? (getCachedProductImage(productWithImage.id) ?? null) : null
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
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productWithImage?.id]);

  const company = post.author.company;
  const authorName = `${post.author.firstName} ${post.author.lastName}`;
  const product = post.product;

  // Firma logosu (yoksa baş harf karesi).
  const logoId = company?.id;
  const logoStamp = company?.logoUpdatedAt ?? null;
  const [logoUrl, setLogoUrl] = useState<string | null>(() =>
    logoId && logoStamp ? (getCachedCompanyLogo(companyLogoKey(logoId, logoStamp)) ?? null) : null
  );
  useEffect(() => {
    if (!logoId || !logoStamp || logoUrl) return;
    let cancelled = false;
    loadCompanyLogo(companyLogoKey(logoId, logoStamp))
      .then((url) => {
        if (!cancelled) setLogoUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [logoId, logoStamp, logoUrl]);

  // "Takibe Al" = ProductFavorite kaydı. İyimser güncelleme.
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

  const isOwnProduct = !!product && !!myCompanyId && product.companyId === myCompanyId;
  const canRequestQuote = !!product && !isOwnProduct && !!onRequestQuote;

  // "Mesaj gönder": yazarla sohbeti açar (yoksa oluşturur). Profil ekranıyla aynı uç.
  const [messageBusy, setMessageBusy] = useState(false);
  const openMessage = async () => {
    if (messageBusy) return;
    setMessageBusy(true);
    try {
      const { conversation } = await startConversation(post.author.id);
      navigation.navigate('Chat', {
        conversationId: conversation.id,
        title: authorName,
        userId: post.author.id,
        avatarUpdatedAt: post.author.avatarUpdatedAt,
      });
    } catch {
      haptics.error();
    } finally {
      setMessageBusy(false);
    }
  };

  // Gövde 3 satırdan uzunsa kısaltılır. Kesilip kesilmediği, görünmez tam
  // metnin yüksekliği kısaltılmış metninkiyle karşılaştırılarak ölçülür
  // (onLayout web ve native'de aynı çalışır; onTextLayout web'de yok).
  const [clampedH, setClampedH] = useState(0);
  const [fullH, setFullH] = useState(0);
  const truncated = fullH > 0 && clampedH > 0 && fullH > clampedH + 1;
  useEffect(() => {
    setExpanded(false);
  }, [post.body]);

  // İkinci satır: solda "Kişi · Görev", sağda göreli zaman (DESIGN.md §3).
  const meta = [
    authorName,
    post.author.position,
    post.visibility === 'connections' ? 'Bağlantılarım' : null,
    post.editedAt ? 'düzenlendi' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const pad = { paddingHorizontal: t.space[4] } as const;

  return (
    <Card noPadding>
      {/* Üst satır */}
      <View
        style={[
          pad,
          { flexDirection: 'row', alignItems: 'center', gap: t.space[3], paddingTop: t.space[3] },
        ]}
      >
        <Pressable
          onPress={() => onOpenAuthor(post)}
          accessibilityRole="button"
          accessibilityLabel={`${authorName}${company ? `, ${company.name}` : ''}, profili aç`}
          style={({ pressed }) => [
            { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: t.space[3] },
            pressed && { opacity: 0.6 },
          ]}
        >
          {logoUrl ? (
            <Image
              source={{ uri: logoUrl }}
              // Logo kareye sığar, kırpılmaz; şeffaf/renkli logolar için beyaz zemin.
              resizeMode="contain"
              style={{
                width: t.size.avatar,
                height: t.size.avatar,
                borderRadius: t.radius.sm,
                borderWidth: 1,
                borderColor: t.colors.line,
                backgroundColor: t.colors.surface1,
              }}
            />
          ) : (
            <Avatar name={company?.name ?? authorName} kind="company" />
          )}
          <View style={{ flex: 1, minWidth: 0, gap: t.space[1] / 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minWidth: 0 }}>
              {/* Firma adı kısaltılmaz: sığmazsa alt satıra kırılır. */}
              <Text style={[t.type.body16Strong, { color: t.colors.ink, flexShrink: 1 }]}>
                {company?.name ?? authorName}
              </Text>
              {company?.verification === 'dogrulanmis' ? (
                <View accessible accessibilityRole="image" accessibilityLabel="Doğrulanmış firma">
                  <Icon name="shield-checkmark" size={t.size.iconXs} color="success" />
                </View>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minWidth: 0 }}>
              <Text numberOfLines={1} style={[t.type.body14, { color: t.colors.ink3, flex: 1, minWidth: 0 }]}>
                {meta}
              </Text>
              <Text style={[t.type.body14, { color: t.colors.ink3 }]}>{formatRelativeTime(post.createdAt)}</Text>
            </View>
          </View>
        </Pressable>
        <Pressable
          onPress={() => setMenuOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel="Gönderi seçenekleri"
          accessibilityState={{ expanded: menuOpen }}
          style={({ pressed }) => ({
            width: t.size.touchMin,
            height: t.size.touchMin,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: t.radius.md,
            backgroundColor: pressed ? t.colors.surface2 : 'transparent',
          })}
        >
          <Icon name="ellipsis-horizontal" size={t.size.iconSm} color="ink3" />
        </Pressable>
      </View>

      {menuOpen ? (
        <View style={[pad, { flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2], paddingTop: t.space[3] }]}>
          <MenuAction icon="share" label="Paylaş" onPress={() => onShare(post)} />
          {product ? (
            <MenuAction
              icon={following ? 'check' : 'heart'}
              label={following ? 'Takipte' : 'Takibe al'}
              onPress={toggleFollow}
            />
          ) : null}
          {canRequestQuote ? (
            <MenuAction icon="quote" label="Teklif iste" onPress={() => onRequestQuote?.(post)} />
          ) : null}
          {isMine ? <MenuAction icon="create-outline" label="Düzenle" onPress={() => onEdit(post)} /> : null}
          {isMine ? (
            <MenuAction icon="trash-outline" label="Sil" danger onPress={() => onDelete(post)} />
          ) : null}
          {!isMine && company && company.id !== myCompanyId && onMuteCompany ? (
            <MenuAction
              icon="eye-off-outline"
              label="Bu firmayı akışımda gizle"
              onPress={() => {
                setMenuOpen(false);
                onMuteCompany(post);
              }}
            />
          ) : null}
          {!isMine ? (
            <MenuAction
              icon="flag-outline"
              label="Şikâyet et"
              danger
              onPress={() => {
                setMenuOpen(false);
                setReportOpen(true);
              }}
            />
          ) : null}
        </View>
      ) : null}
      {!isMine ? (
        <ReportPostSheet postId={post.id} visible={reportOpen} onClose={() => setReportOpen(false)} />
      ) : null}

      {/* Açık talep: gönderi metni yerine talep özeti */}
      {tender ? (
        <Pressable
          onPress={openTender}
          accessibilityRole="button"
          accessibilityLabel={`Açık talep: ${tender.title}, ayrıntıyı aç`}
          style={[pad, { paddingTop: t.space[3] }]}
        >
          {({ pressed }) => (
            <View
              style={{
                gap: t.space[2],
                padding: t.space[3],
                borderRadius: t.radius.md,
                borderWidth: 1,
                borderColor: t.colors.line,
                backgroundColor: pressed ? t.colors.surface2 : t.colors.surface0,
              }}
            >
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
                <Badge kind="new" label="Açık talep" />
                {tender.status !== 'open' ? <Badge {...tenderBadge(tender)} /> : null}
              </View>
              <View style={{ flexDirection: 'row', gap: t.space[3] }}>
                {tender.coverMediaId ? <TenderCoverThumb tenderId={tender.id} mediaId={tender.coverMediaId} /> : null}
                <View style={{ flex: 1, minWidth: 0, gap: t.space[1] }}>
                  <Text numberOfLines={2} style={[t.type.body16Strong, { color: t.colors.ink }]}>
                    {tender.title}
                  </Text>
                  {tender.summary ? (
                    <Text numberOfLines={2} style={[t.type.mono14, { color: t.colors.ink2 }]}>
                      {tender.summary}
                    </Text>
                  ) : null}
                  <Text style={[t.type.caption12, { color: t.colors.ink3 }]}>{tenderMetaLine(tender)}</Text>
                  <TenderAttachmentLine mediaCount={tender.mediaCount} videoCount={tender.videoCount} />
                </View>
              </View>
            </View>
          )}
        </Pressable>
      ) : null}

      {/* Metin */}
      {post.body && !tender ? (
        <View style={[pad, { paddingTop: t.space[3] }]}>
          <View>
            {/* Ölçüm kopyası: görünmez, tam metin, aynı genişlik. */}
            {!expanded ? (
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                pointerEvents="none"
                onLayout={(e) => setFullH(e.nativeEvent.layout.height)}
                style={[t.type.body16, { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 }]}
              >
                {post.body}
              </Text>
            ) : null}
            <Text
              numberOfLines={expanded ? undefined : BODY_LINES}
              onLayout={expanded ? undefined : (e) => setClampedH(e.nativeEvent.layout.height)}
              style={[t.type.body16, { color: t.colors.ink }]}
            >
              {post.body}
            </Text>
          </View>
          {!expanded && truncated ? (
            <Pressable
              onPress={() => setExpanded(true)}
              accessibilityRole="button"
              accessibilityLabel="Metnin devamını oku"
              hitSlop={{ top: t.space[2], bottom: t.space[2], right: t.space[4] }}
              style={({ pressed }) => [{ alignSelf: 'flex-start', paddingTop: t.space[1] }, pressed && { opacity: 0.6 }]}
            >
              <Text style={[t.type.label14, { color: t.colors.brand }]}>…devamı</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Paylaşılan bağlantı */}
      {post.link ? (
        <View style={[pad, { paddingTop: t.space[3] }]}>
          <PostLinkCard postId={post.id} link={post.link} />
        </View>
      ) : null}

      {/* Görsel */}
      {post.video ? (
        <View style={{ paddingTop: t.space[3] }}>
          <PostVideo key={post.video.id} video={post.video} />
        </View>
      ) : post.hasImage || productWithImage ? (
        <View style={[pad, { paddingTop: t.space[3] }]}>
          <PostImage
            uri={post.hasImage ? imageUrl : productImageUrl}
            onPress={productWithImage ? () => onOpenProduct(post) : undefined}
          />
        </View>
      ) : null}

      {/* Ürün çipi */}
      {product ? (
        <View style={[pad, { paddingTop: t.space[3] }]}>
          <Pressable
            onPress={() => onOpenProduct(post)}
            accessibilityRole="button"
            accessibilityLabel={`${product.code} ürün sayfasını aç`}
            style={({ pressed }) => ({
              minHeight: t.size.touchMin,
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.space[3],
              paddingHorizontal: t.space[2],
              borderRadius: t.radius.md,
              borderWidth: 1,
              borderColor: t.colors.line,
              backgroundColor: pressed ? t.colors.surface2 : t.colors.surface0,
              minWidth: 0,
            })}
          >
            <View
              style={{
                width: t.size.avatarSm,
                height: t.size.avatarSm,
                borderRadius: t.radius.sm,
                backgroundColor: t.colors.surface2,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {productImageUrl ? (
                <Image source={{ uri: productImageUrl }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
              ) : (
                <Icon name="fabric" size={t.size.iconSm} color="ink3" />
              )}
            </View>
            <Text numberOfLines={1} style={[t.type.body14, { color: t.colors.ink, flexShrink: 1 }]}>
              {product.subtype || product.type}
            </Text>
            <Text numberOfLines={1} style={[t.type.mono14, { color: t.colors.ink2 }]}>
              {product.code}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Alt eylem satırı: 3 eşit eylem */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: t.space[3],
          borderTopWidth: 1,
          borderTopColor: t.colors.line,
        }}
      >
        <BarAction
          icon={post.likedByMe ? 'heart' : 'heart-outline'}
          label={post.likedByMe ? 'Beğeniyi geri al' : 'Beğen'}
          count={post.likeCount}
          active={post.likedByMe}
          onPress={() => onToggleLike(post)}
        />
        <BarAction
          icon="message"
          label="Yorumlar"
          count={post.commentCount}
          onPress={() => onOpenComments(post)}
        />
        {tender ? (
          <BarAction
            icon="quote"
            label={isMine ? 'Teklifleri gör' : 'Teklif ver'}
            text={isMine ? 'Teklifleri gör' : 'Teklif ver'}
            brand
            onPress={openTender}
          />
        ) : product ? (
          <BarAction
            icon="sample"
            label={`${product.code} için numune talep et`}
            text="Numune talep et"
            brand
            onPress={() => onRequestSample(post)}
          />
        ) : isMine ? (
          <BarAction icon="share" label="Paylaş" text="Paylaş" brand onPress={() => onShare(post)} />
        ) : (
          <BarAction
            icon="message"
            label={`${authorName} kişisine mesaj gönder`}
            text="Mesaj gönder"
            brand
            onPress={openMessage}
          />
        )}
      </View>
    </Card>
  );
}

function PostImage({ uri, onPress }: { uri: string | null; onPress?: () => void }) {
  const t = useTheme();
  const box = {
    width: '100%',
    aspectRatio: 343 / 180,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  } as const;

  const content = uri ? (
    <Image source={{ uri }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
  ) : (
    <Icon name="image-outline" color="ink3" />
  );

  if (!onPress) return <View style={box}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Ürün fotoğrafı, ürün sayfasını aç"
      style={({ pressed }) => [box, pressed && { opacity: 0.9 }]}
    >
      {content}
    </Pressable>
  );
}

function BarAction({
  icon,
  label,
  text,
  count,
  active,
  brand,
  onPress,
}: {
  icon: AnyIconName;
  label: string;
  text?: string;
  count?: number;
  active?: boolean;
  brand?: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const color = brand ? t.colors.brand : active ? t.colors.accent : t.colors.ink2;
  const showCount = count !== undefined && count > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={showCount ? `${label}, ${count}` : label}
      accessibilityState={active !== undefined ? { selected: active } : undefined}
      style={({ pressed }) => ({
        flex: text ? 2 : 1,
        minWidth: 0,
        minHeight: t.size.touchMin,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: t.space[1],
        paddingHorizontal: t.space[2],
        backgroundColor: pressed ? t.colors.surface2 : 'transparent',
      })}
    >
      <Icon name={icon} size={t.size.iconSm} colorValue={color} />
      {showCount ? <Text style={[t.type.label14, { color }]}>{count}</Text> : null}
      {text ? (
        <Text numberOfLines={1} style={[t.type.label14, { color, flexShrink: 1 }]}>
          {text}
        </Text>
      ) : null}
    </Pressable>
  );
}

function MenuAction({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: AnyIconName;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const color = danger ? t.colors.danger : t.colors.brand;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        minHeight: t.size.chip,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space[1],
        paddingHorizontal: t.space[3],
        borderRadius: t.radius.full,
        borderWidth: 1,
        borderColor: t.colors.lineStrong,
        backgroundColor: pressed ? t.colors.surface2 : 'transparent',
      })}
    >
      <Icon name={icon} size={t.size.iconSm} colorValue={color} />
      <Text style={[t.type.label14, { color }]}>{label}</Text>
    </Pressable>
  );
}

export const PostCard = React.memo(PostCardComponent);

// Bağlantı kartı: görsel akış yanıtında gelmez, kart çizilince tek tek çekilir.
function PostLinkCard({ postId, link }: { postId: string; link: NonNullable<FeedPost['link']> }) {
  const [imageUri, setImageUri] = useState<string | null>(() => getCachedLinkImage(postId) ?? null);
  useEffect(() => {
    if (!link.hasImage || imageUri) return;
    let cancelled = false;
    loadLinkImage(postId)
      .then((uri) => {
        if (!cancelled) setImageUri(uri);
      })
      .catch(() => {
        // Görsel gelmezse yer tutucu kalır.
      });
    return () => {
      cancelled = true;
    };
  }, [postId, link.hasImage, imageUri]);
  return (
    <LinkPreviewCard
      url={link.url}
      title={link.title}
      description={link.description}
      siteName={link.siteName}
      hasImage={link.hasImage}
      imageUri={imageUri}
    />
  );
}
