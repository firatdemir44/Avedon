import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, Alert, Share, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { MainTabScreenProps } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import {
  deletePost,
  fetchFeed,
  likePost,
  unlikePost,
  type FeedCursor,
  type FeedPost,
} from '../../api/client';
import { PostCard } from './PostCard';
import { colors, radius, spacing, typography } from '../../theme';

type Props = MainTabScreenProps<'Feed'>;

// Sekme geçişlerinde akışın başa sarmaması için yenileme aralığı.
const REFRESH_THROTTLE_MS = 30000;

export function FeedScreen({ navigation }: Props) {
  const { user } = useSession();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<FeedCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);
  const lastLoadedAtRef = useRef(0);

  const loadFirstPage = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    return fetchFeed()
      .then(({ posts: fetched, nextCursor }) => {
        setPosts(fetched);
        setCursor(nextCursor);
        setError(null);
        lastLoadedAtRef.current = Date.now();
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Akış alınamadı'))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  // Yorum ekranından dönünce yorum sayısı güncellensin diye odaklanmada ilk
  // sayfa yeniden yükleniyor. Ama bu sekmeli yapıda her sekme geçişinde de
  // tetikleniyor ve listeyi (dolayısıyla kaydırma konumunu) sıfırlıyordu —
  // 30 saniyeden yeni bir yükleme varsa atlıyoruz.
  useFocusEffect(
    useCallback(() => {
      const isFresh = Date.now() - lastLoadedAtRef.current < REFRESH_THROTTLE_MS;
      if (isFresh && posts.length > 0) return;
      loadFirstPage();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadFirstPage])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      // AI Danışman bir hesaplama aracı değil, o yüzden Hesaplamalar sekmesinde
      // değil ana ekranda duruyor — her zaman tek dokunuş uzakta.
      headerLeft: () => (
        <Pressable
          onPress={() => navigation.navigate('Advisor')}
          hitSlop={8}
          accessibilityLabel="AI Tekstil Danışmanı"
          style={styles.headerLeftButton}
        >
          <Ionicons name="sparkles" size={18} color={colors.accent} />
          <Text style={styles.headerAction}>Danışman</Text>
        </Pressable>
      ),
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('CreatePost')} hitSlop={8}>
          <Text style={styles.headerAction}>+ Paylaş</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  const loadMore = async () => {
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    try {
      const { posts: older, nextCursor } = await fetchFeed(cursor);
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...older.filter((p) => !seen.has(p.id))];
      });
      setCursor(nextCursor);
    } catch {
      // sessizce geç, kullanıcı tekrar kaydırınca yeniden denenir
    } finally {
      loadingMoreRef.current = false;
    }
  };

  const handleToggleLike = async (post: FeedPost) => {
    const wasLiked = post.likedByMe;
    // İyimser güncelleme, sunucudan dönen kesin sayıyla düzeltiliyor.
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, likedByMe: !wasLiked, likeCount: p.likeCount + (wasLiked ? -1 : 1) }
          : p
      )
    );
    try {
      const result = wasLiked ? await unlikePost(post.id) : await likePost(post.id);
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, likedByMe: result.liked, likeCount: result.likeCount } : p))
      );
    } catch {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id ? { ...p, likedByMe: wasLiked, likeCount: post.likeCount } : p
        )
      );
    }
  };

  const handleShare = (post: FeedPost) => {
    const author = `${post.author.firstName} ${post.author.lastName}`;
    Share.share({ message: `${author} (Avedon):\n\n${post.body}` }).catch(() => {});
  };

  const handleDelete = (post: FeedPost) => {
    Alert.alert('Gönderiyi sil', 'Bu gönderi kalıcı olarak silinecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePost(post.id);
            setPosts((prev) => prev.filter((p) => p.id !== post.id));
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Gönderi silinemedi');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          loadFirstPage(true);
        }}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {error ??
              'Henüz gönderi yok. İlk gönderiyi siz paylaşın veya bağlantı kurarak akışınızı zenginleştirin.'}
          </Text>
        }
        ListFooterComponent={
          cursor ? <ActivityIndicator style={{ marginVertical: spacing.md }} color={colors.primary} /> : null
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            isMine={item.author.id === user?.id}
            onToggleLike={handleToggleLike}
            onOpenComments={(post) => navigation.navigate('PostComments', { postId: post.id })}
            onOpenAuthor={(post) => navigation.navigate('Profile', { userId: post.author.id })}
            onOpenProduct={(post) =>
              post.product &&
              navigation.navigate('SampleRequestForm', {
                productId: post.product.id,
                productCode: post.product.code,
              })
            }
            onShare={handleShare}
            onDelete={handleDelete}
          />
        )}
      />
      {error && posts.length > 0 ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerAction: { ...typography.bodyStrong, color: colors.accent },
  headerLeftButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  listContent: { padding: spacing.lg },
  empty: { ...typography.body, textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
  error: {
    ...typography.label,
    fontWeight: '400',
    color: colors.danger,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
});
