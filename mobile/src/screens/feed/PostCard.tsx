import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { formatRelativeTime } from '../../features/time';
import { getCachedPostImage, loadPostImage } from '../../features/feed/postImageCache';
import type { FeedPost } from '../../api/client';
import { colors, radius, spacing } from '../../theme';

interface Props {
  post: FeedPost;
  isMine: boolean;
  onToggleLike: (post: FeedPost) => void;
  onOpenComments: (post: FeedPost) => void;
  onOpenProduct: (post: FeedPost) => void;
  onOpenAuthor: (post: FeedPost) => void;
  onShare: (post: FeedPost) => void;
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
          <Text style={styles.name} numberOfLines={1}>
            {post.author.firstName} {post.author.lastName}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {company ? `${post.author.position} · ${company.name}` : post.author.position}
          </Text>
          <Text style={styles.meta}>
            {formatRelativeTime(post.createdAt)} ·{' '}
            {post.visibility === 'public' ? 'Herkese açık' : 'Bağlantılarım'}
          </Text>
        </Pressable>
        {company ? <CompanyAvatar name={company.name} verification={company.verification} /> : null}
      </View>

      {post.body ? <Text style={styles.body}>{post.body}</Text> : null}

      {post.hasImage ? (
        imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text style={styles.meta}>Fotoğraf yükleniyor...</Text>
          </View>
        )
      ) : null}

      <View style={styles.actionRow}>
        <Pressable style={styles.action} onPress={() => onToggleLike(post)}>
          <Text style={[styles.actionText, post.likedByMe && styles.actionTextActive]}>
            {post.likedByMe ? '♥' : '♡'} Beğen{post.likeCount > 0 ? ` (${post.likeCount})` : ''}
          </Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => onOpenComments(post)}>
          <Text style={styles.actionText}>
            Yorum{post.commentCount > 0 ? ` (${post.commentCount})` : ''}
          </Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => onShare(post)}>
          <Text style={styles.actionText}>Paylaş</Text>
        </Pressable>
        {post.product ? (
          <Pressable style={styles.action} onPress={() => onOpenProduct(post)}>
            <Text style={[styles.actionText, styles.actionTextActive]}>Talep Et</Text>
          </Pressable>
        ) : null}
      </View>

      {post.product ? <Text style={styles.productTag}>Ürün: {post.product.code}</Text> : null}

      {isMine ? (
        <Pressable onPress={() => onDelete(post)} style={styles.deleteRow}>
          <Text style={styles.deleteText}>Sil</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const PostCard = React.memo(PostCardComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  headerText: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  body: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
    marginTop: spacing.sm,
  },
  image: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.sm,
    marginTop: spacing.sm,
    backgroundColor: colors.background,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  action: { paddingVertical: 2 },
  actionText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  actionTextActive: { color: colors.primary },
  productTag: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  deleteRow: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  deleteText: { fontSize: 12, fontWeight: '600', color: colors.danger },
});
