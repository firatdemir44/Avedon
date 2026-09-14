import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { PostVideo } from '../../components/PostVideo';
import { formatRelativeTime } from '../../features/time';
import { getCachedPostImage, loadPostImage } from '../../features/feed/postImageCache';
import type { FeedPost } from '../../api/client';
import { MIN_TOUCH, colors, radius, shadow, spacing, typography } from '../../theme';

interface Props {
  post: FeedPost;
  isMine: boolean;
  onToggleLike: (post: FeedPost) => void;
  onOpenComments: (post: FeedPost) => void;
  onOpenProduct: (post: FeedPost) => void;
  onOpenAuthor: (post: FeedPost) => void;
  onShare: (post: FeedPost) => void;
  onEdit: (post: FeedPost) => void;
  onDelete: (post: FeedPost) => void;
}

function PostCardComponent({
  post,
  isMine,
  onToggleLike,
  onOpenComments,
  onOpenProduct,
  onOpenAuthor,
  onShare,
  onEdit,
  onDelete,
}: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(
    post.imageUrl ?? getCachedPostImage(post.id) ?? null
  );

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

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Pressable style={styles.headerText} onPress={() => onOpenAuthor(post)}>
          {/* Tasarımda yazar adı mavi ve kalın — akışta en çok tıklanan hedef. */}
          <Text style={styles.name} numberOfLines={1}>
            {post.author.firstName} {post.author.lastName}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {company ? `${post.author.position} · ${company.name}` : post.author.position}
          </Text>
          <Text style={styles.meta}>
            {formatRelativeTime(post.createdAt)} ·{' '}
            {post.visibility === 'public' ? 'Herkese açık' : 'Bağlantılarım'}
            {post.editedAt ? ' · düzenlendi' : ''}
          </Text>
        </Pressable>
        {company ? (
          <CompanyAvatar
            name={company.name}
            verification={company.verification}
            companyId={company.id}
            logoUpdatedAt={company.logoUpdatedAt}
          />
        ) : null}
      </View>

      {/* Tasarımdaki sıra: FOTOĞRAF → sayaçlar → metin. Fotoğrafı metnin altına
          koymak kaydırırken görseli geciktiriyordu; her sosyal uygulamada da
          görsel önce geliyor. */}
      {post.video ? (
        <PostVideo key={post.video.id} video={post.video} />
      ) : post.hasImage ? (
        imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text style={styles.meta}>Fotoğraf yükleniyor...</Text>
          </View>
        )
      ) : null}

      {post.likeCount > 0 || post.commentCount > 0 ? (
        <View style={styles.countRow}>
          {post.likeCount > 0 ? (
            <Text style={styles.countText}>♥ {post.likeCount}</Text>
          ) : null}
          {post.commentCount > 0 ? (
            <Pressable onPress={() => onOpenComments(post)} hitSlop={8}>
              <Text style={styles.countText}>{post.commentCount} yorum</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {post.body ? <Text style={styles.body}>{post.body}</Text> : null}

      {post.product ? (
        <Pressable style={styles.productTag} onPress={() => onOpenProduct(post)}>
          <Ionicons name="pricetag-outline" size={13} color={colors.primary} />
          <Text style={styles.productTagText}>{post.product.code}</Text>
        </Pressable>
      ) : null}

      {/* Tasarımdaki eşit sütunlu, ikon + etiket aksiyon satırı. Önceki hâli
          ikonsuz ve sola yaslıydı; dokunma hedefleri de 48px altındaydı. */}
      <View style={styles.actionRow}>
        <Action
          icon={post.likedByMe ? 'heart' : 'heart-outline'}
          label="Beğen"
          active={post.likedByMe}
          onPress={() => onToggleLike(post)}
        />
        <Action icon="chatbubble-outline" label="Yorum Yap" onPress={() => onOpenComments(post)} />
        <Action icon="arrow-redo-outline" label="Paylaş" onPress={() => onShare(post)} />
        {post.product ? (
          <Action icon="cube-outline" label="Talep Et" active onPress={() => onOpenProduct(post)} />
        ) : null}
      </View>

      {isMine ? (
        <View style={styles.ownerRow}>
          <Pressable
            onPress={() => onEdit(post)}
            hitSlop={8}
            style={styles.ownerAction}
            accessibilityRole="button"
            accessibilityLabel="Gönderiyi düzenle"
          >
            <Ionicons name="create-outline" size={16} color={colors.accent} />
            <Text style={styles.editText}>Düzenle</Text>
          </Pressable>
          <Pressable
            onPress={() => onDelete(post)}
            hitSlop={8}
            style={styles.ownerAction}
            accessibilityRole="button"
            accessibilityLabel="Gönderiyi sil"
          >
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
            <Text style={styles.deleteText}>Sil</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Action({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const color = active ? colors.accent : colors.textMuted;
  return (
    <Pressable
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={19} color={color} />
      <Text style={[styles.actionText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export const PostCard = React.memo(PostCardComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  headerText: { flex: 1, minWidth: 0 },
  name: { ...typography.bodyStrong, fontWeight: '700', color: colors.accent },
  meta: { ...typography.caption, color: colors.textMuted, marginTop: 1 },
  body: {
    ...typography.body,
    color: colors.text,
    marginTop: spacing.sm,
  },
  image: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceTonal,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  countText: { ...typography.caption, color: colors.textMuted },
  productTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.sm,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  productTagText: { ...typography.caption, fontWeight: '600', color: colors.primary },
  actionRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
  action: {
    flex: 1,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  actionPressed: { opacity: 0.6 },
  actionText: { ...typography.caption, fontWeight: '600' },
  ownerRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  ownerAction: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  editText: { ...typography.caption, fontWeight: '600', color: colors.accent },
  deleteText: { ...typography.caption, fontWeight: '600', color: colors.danger },
});
