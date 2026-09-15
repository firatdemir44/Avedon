import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { PostVideo } from '../../components/PostVideo';
import { PrimaryButton } from '../../components/PrimaryButton';
import { StockValue } from '../../components/StockIndicator';
import { formatRelativeTime } from '../../features/time';
import { formatMeasure } from '../../features/calculators/parse';
import { getCachedPostImage, loadPostImage } from '../../features/feed/postImageCache';
import type { FeedPost } from '../../api/client';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

interface Props {
  post: FeedPost;
  isMine: boolean;
  onToggleLike: (post: FeedPost) => void;
  onOpenComments: (post: FeedPost) => void;
  // Ölçü şeridi → ürün sayfası; "Talep Et" → numune talep formu.
  onOpenProduct: (post: FeedPost) => void;
  onRequestSample: (post: FeedPost) => void;
  onOpenAuthor: (post: FeedPost) => void;
  onShare: (post: FeedPost) => void;
  onEdit: (post: FeedPost) => void;
  onDelete: (post: FeedPost) => void;
}

// Taslak: docs/tasarim-yonleri/Main.dc.html. Kenardan kenara beyaz blok:
// yazar satırı → görsel → ürün ölçü şeridi → metin → eylem çubuğu (solda beğeni,
// yorum ve paylaş sayaçları, sağda "Talep Et").
function PostCardComponent({
  post,
  isMine,
  onToggleLike,
  onOpenComments,
  onOpenProduct,
  onRequestSample,
  onOpenAuthor,
  onShare,
  onEdit,
  onDelete,
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

  const company = post.author.company;
  const authorName = `${post.author.firstName} ${post.author.lastName}`;
  const product = post.product;
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
      ) : null}

      {product ? (
        <Pressable
          onPress={() => onOpenProduct(post)}
          accessibilityRole="button"
          accessibilityLabel={`${product.code}, ${formatMeasure(product.weightGsm)} gram metrekare, ${formatMeasure(product.widthCm)} santim en, ürün sayfasını aç`}
          style={({ pressed }) => [styles.specStrip, pressed && styles.pressedBg]}
        >
          <Text style={[styles.specCell, styles.specCode]} numberOfLines={1}>
            {product.code}
          </Text>
          <View style={styles.specDivider} />
          <Text style={styles.specCell} numberOfLines={1}>
            {formatMeasure(product.weightGsm)} gr/m²
          </Text>
          <View style={styles.specDivider} />
          <Text style={styles.specCell} numberOfLines={1}>
            {formatMeasure(product.widthCm)} cm
          </Text>
          <View style={styles.specDivider} />
          <StockValue stock={product.stock} unit={product.stockUnit} style={styles.specStock} />
        </Pressable>
      ) : null}

      {post.body ? <Text style={styles.body}>{post.body}</Text> : null}

      <View style={styles.actionBar}>
        <View style={styles.actionGroup}>
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
        {product ? (
          <PrimaryButton
            label="Talep Et"
            icon="cube-outline"
            onPress={() => onRequestSample(post)}
            accessibilityLabel={`${product.code} için numune talep et`}
            style={styles.requestButton}
          />
        ) : null}
      </View>
    </View>
  );
}

function CountAction({
  icon,
  count,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  count?: number;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const color = active ? colors.accent : colors.textMuted;
  const showCount = count !== undefined && count > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={showCount ? `${label}, ${count}` : label}
      accessibilityState={active !== undefined ? { selected: active } : undefined}
      style={({ pressed }) => [styles.countAction, pressed && styles.pressedFade]}
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
  specStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  specCell: {
    ...typography.mono,
    fontSize: 14,
    lineHeight: 16,
    color: colors.text,
    paddingHorizontal: 10,
    flexShrink: 1,
  },
  specCode: { fontFamily: fonts.monoSemibold, fontSize: 15, color: colors.primary },
  specDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  specStock: { paddingHorizontal: 10, flexShrink: 0 },
  body: { ...typography.body, color: colors.text },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionGroup: { flexDirection: 'row', alignItems: 'center' },
  countAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: MIN_TOUCH,
    minWidth: MIN_TOUCH,
    paddingRight: spacing.gutter,
  },
  countText: { ...typography.label, fontFamily: fonts.semibold },
  requestButton: { paddingHorizontal: spacing.gutter },
});
