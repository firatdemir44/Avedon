import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, AppState, Share, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import type { MainTabScreenProps } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import {
  deletePost,
  fetchFeed,
  fetchUnreadNotificationCount,
  likePost,
  unlikePost,
  type FeedCursor,
  type FeedPost,
  type FeedScope,
} from '../../api/client';
import { PostCard } from './PostCard';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { HeaderButton } from '../../components/HeaderButton';
import { refreshControl } from '../../components/refresh';
import { consumeFeedStale } from '../../features/feed/feedRefresh';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

type Props = MainTabScreenProps<'Feed'>;

// Sekme geçişlerinde akışın başa sarmaması için yenileme aralığı.
const REFRESH_THROTTLE_MS = 30000;

// Ürünler ekranındaki görünüm seçimiyle aynı kalıp: iki eşit düğme, seçim
// cihazda hatırlanır (Faz 1, Adım 6).
const SCOPE_KEY = 'avedon.feedScope';

// Zil rozeti: ekran odaklanınca ve uygulama ön plandayken dakikada bir tazelenir
// (Faz 2, Adım 1). Push bildirimi yok, sayaç yoklamayla geliyor.
const NOTIFICATION_POLL_MS = 60000;

export function FeedScreen({ navigation }: Props) {
  const { user } = useSession();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<FeedCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<FeedScope>('all');
  // Kayıtlı seçim okunana kadar akışı çekmiyoruz, yoksa "Bağlantılarım"
  // seçiliyken önce "Tümü" yükleniyor ve liste iki kez zıplıyor.
  const [scopeReady, setScopeReady] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const loadingMoreRef = useRef(false);
  const lastLoadedAtRef = useRef(0);
  const hasPostsRef = useRef(false);
  hasPostsRef.current = posts.length > 0;
  const scopeRef = useRef<FeedScope>(scope);
  scopeRef.current = scope;

  useEffect(() => {
    AsyncStorage.getItem(SCOPE_KEY)
      .then((saved) => {
        if (saved === 'connections') setScope('connections');
      })
      .catch(() => {})
      .finally(() => setScopeReady(true));
  }, []);

  const loadFirstPage = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    const requested = scopeRef.current;
    return fetchFeed(null, 10, requested)
      .then(({ posts: fetched, nextCursor }) => {
        // Kullanıcı yükleme sürerken sekme değiştirdiyse eski yanıt yazılmasın.
        if (scopeRef.current !== requested) return;
        setPosts(fetched);
        setCursor(nextCursor);
        setError(null);
        lastLoadedAtRef.current = Date.now();
      })
      .catch((err) => {
        if (scopeRef.current !== requested) return;
        setError(friendlyMessage(err, 'Akış alınamadı'));
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  const changeScope = (next: FeedScope) => {
    if (next === scope) return;
    haptics.selection();
    scopeRef.current = next;
    setScope(next);
    setPosts([]);
    setCursor(null);
    setError(null);
    lastLoadedAtRef.current = 0;
    hasPostsRef.current = false;
    AsyncStorage.setItem(SCOPE_KEY, next).catch(() => {});
    setLoading(true);
    loadFirstPage();
  };

  // Yorum ekranından dönünce yorum sayısı güncellensin diye odaklanmada ilk
  // sayfa yeniden yükleniyor. Ama bu sekmeli yapıda her sekme geçişinde de
  // tetikleniyor ve listeyi (dolayısıyla kaydırma konumunu) sıfırlıyordu —
  // 30 saniyeden yeni bir yükleme varsa atlıyoruz.
  useFocusEffect(
    useCallback(() => {
      if (!scopeReady) return;
      const stale = consumeFeedStale();
      const isFresh = Date.now() - lastLoadedAtRef.current < REFRESH_THROTTLE_MS;
      // `posts` bu kapanışta hep ilk değeri ([]) görüyordu, kısıtlama hiç
      // devreye girmiyordu; güncel durum ref'ten okunuyor.
      if (!stale && isFresh && hasPostsRef.current) return;
      // Liste ekrandayken iskelete dönmeden sessizce yenile.
      loadFirstPage(hasPostsRef.current);
    }, [loadFirstPage, scopeReady])
  );

  // Okunmamış bildirim sayacı: hata sessiz (kozmetik), sayfa çalışmaya devam eder.
  const refreshUnreadNotifications = useCallback(() => {
    if (AppState.currentState !== 'active') return;
    fetchUnreadNotificationCount()
      .then(({ unreadCount }) => setUnreadNotifications(unreadCount))
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshUnreadNotifications();
      const timer = setInterval(refreshUnreadNotifications, NOTIFICATION_POLL_MS);
      return () => clearInterval(timer);
    }, [refreshUnreadNotifications])
  );

  useLayoutEffect(() => {
    // Taslakta iki başlık eylemi de ikon düğmesi (denetim FINDING-016: biri
    // ikon + yazı, diğeri düz metindi). Soldaki kısayol artık firma asistanı
    // sekmesini açıyor (Faz 1 Adım 5; eski "AI Tekstil Danışmanı" ekranı kalktı).
    navigation.setOptions({
      headerLeft: () => (
        <HeaderButton
          icon="sparkles-outline"
          label="Firma asistanı"
          onPress={() => navigation.navigate('AssistantTab')}
        />
      ),
      headerRight: () => (
        <View style={styles.headerActions}>
          <HeaderButton
            icon="notifications-outline"
            label="Bildirimler"
            badge={unreadNotifications}
            onPress={() => navigation.navigate('Notifications')}
          />
          <HeaderButton icon="add" label="Gönderi paylaş" onPress={() => navigation.navigate('CreatePost')} />
        </View>
      ),
    });
  }, [navigation, unreadNotifications]);

  const loadMore = async () => {
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    const requested = scopeRef.current;
    try {
      const { posts: older, nextCursor } = await fetchFeed(cursor, 10, requested);
      if (scopeRef.current !== requested) return;
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
    haptics.light();
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

  const handleDelete = async (post: FeedPost) => {
    const confirmed = await confirmAction({
      title: 'Gönderiyi sil',
      message: 'Bu gönderi kalıcı olarak silinecek.',
      confirmLabel: 'Sil',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deletePost(post.id);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      haptics.success();
    } catch (err) {
      haptics.error();
      setError(friendlyMessage(err, 'Gönderi silinemedi'));
    }
  };

  const scopeToggle = (
    <View style={styles.toggleBar} accessibilityRole="tablist">
      {(
        [
          { value: 'all', label: 'Tümü', icon: 'earth-outline' },
          { value: 'connections', label: 'Bağlantılarım', icon: 'people-outline' },
        ] as const
      ).map((option) => {
        const selected = scope === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => changeScope(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={
              option.value === 'all' ? 'Tüm gönderiler' : 'Yalnızca bağlantılarımın gönderileri'
            }
            style={({ pressed }) => [
              styles.toggleOption,
              selected && styles.toggleSelected,
              pressed && !selected && styles.togglePressed,
            ]}
          >
            <Ionicons name={option.icon} size={18} color={selected ? colors.primaryText : colors.textMuted} />
            <Text style={[styles.toggleText, selected && styles.toggleTextSelected]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        {scopeToggle}
        <SkeletonList variant="post" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {scopeToggle}
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={BlockGap}
        refreshControl={refreshControl(refreshing, () => {
          setRefreshing(true);
          loadFirstPage(true);
        })}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          error && posts.length > 0 ? (
            <InlineError message={error} onRetry={() => loadFirstPage(true)} style={styles.banner} />
          ) : null
        }
        ListEmptyComponent={
          error ? (
            <ErrorState error={error} onRetry={() => loadFirstPage()} />
          ) : scope === 'connections' ? (
            <EmptyState
              icon="people-outline"
              title="Bağlantı akışı boş"
              message="Henüz bağlantınız yok ya da bağlantılarınız paylaşım yapmadı."
              actionLabel="Bağlantı bul"
              onAction={() => navigation.navigate('Connections')}
            />
          ) : (
            <EmptyState
              icon="newspaper-outline"
              title="Akış henüz boş"
              message="İlk gönderiyi siz paylaşın ya da bağlantı kurarak akışınızı zenginleştirin."
              actionLabel="Gönderi paylaş"
              onAction={() => navigation.navigate('CreatePost')}
            />
          )
        }
        ListFooterComponent={
          cursor ? <ActivityIndicator style={{ marginVertical: spacing.md }} color={colors.primary} /> : null
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            isMine={item.author.id === user?.id}
            myCompanyId={user?.companyId ?? null}
            onToggleLike={handleToggleLike}
            onOpenChat={(conversationId, title) => navigation.navigate('Chat', { conversationId, title })}
            onOpenComments={(post) => navigation.navigate('PostComments', { postId: post.id })}
            onOpenAuthor={(post) => navigation.navigate('Profile', { userId: post.author.id })}
            onOpenProduct={(post) => post.product && navigation.navigate('ProductDetail', { productId: post.product.id })}
            onRequestSample={(post) =>
              post.product &&
              navigation.navigate('SampleRequestForm', {
                productId: post.product.id,
                productCode: post.product.code,
              })
            }
            onShare={handleShare}
            onEdit={(post) => navigation.navigate('CreatePost', { postId: post.id })}
            onDelete={handleDelete}
          />
        )}
      />
    </View>
  );
}

function BlockGap() {
  return <View style={styles.blockGap} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingTop: spacing.blockGap, paddingBottom: spacing.xl },
  blockGap: { height: spacing.blockGap },
  banner: { marginHorizontal: spacing.gutter, marginBottom: spacing.blockGap },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  toggleBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  toggleOption: {
    flex: 1,
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  toggleSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  togglePressed: { backgroundColor: colors.pressed },
  toggleText: { ...typography.label, fontFamily: fonts.semibold, color: colors.textMuted, flexShrink: 1 },
  toggleTextSelected: { color: colors.primaryText },
});
