// Ana sayfa (yeni tasarım, 3. adım — DESIGN.md §8, artboard 1).
//
// Rota adı `Feed` DEĞİŞMEDİ (başka ekranlar oraya navigate ediyor); sekme
// etiketi "Ana sayfa". Düzen: AppBar (logo + Avedon + zil + profil) → 48px
// arama kutusu → "Bugün" sayaçları → 4 kısayol → "Sektörden" akışı.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Share, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import type { MainTabScreenProps } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import {
  deletePost,
  fetchFeed,
  fetchToday,
  likePost,
  unlikePost,
  type FeedCursor,
  type FeedPost,
  type FeedScope,
  type TodaySummary,
} from '../../api/client';
import { PostCard } from './PostCard';
import { friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { consumeFeedStale } from '../../features/feed/feedRefresh';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import {
  AppBar,
  Button,
  EmptyState,
  Icon,
  QuickAction,
  Screen,
  SearchBox,
  SectionTitle,
  Skeleton,
  StatBox,
} from '../../ui';

type Props = MainTabScreenProps<'Feed'>;

// Sekme geçişlerinde akışın başa sarmaması için yenileme aralığı.
const REFRESH_THROTTLE_MS = 30000;
const SCOPE_KEY = 'avedon.feedScope';

export function FeedScreen({ navigation }: Props) {
  const t = useTheme();
  const { user } = useSession();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<FeedCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<FeedScope>('all');
  const [scopeReady, setScopeReady] = useState(false);
  const [today, setToday] = useState<TodaySummary | null>(null);
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

  const loadToday = useCallback(() => {
    fetchToday()
      .then(setToday)
      .catch(() => {
        // Sayaçlar gelmezse kutular "—" gösterir; akış yine çalışır.
      });
  }, []);

  const loadFirstPage = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    const requested = scopeRef.current;
    return fetchFeed(null, 10, requested)
      .then(({ posts: fetched, nextCursor }) => {
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

  // Odaklanmada sessiz yenileme; 30 saniyeden yeni yükleme varsa atlanır
  // (yoksa her sekme geçişinde liste başa sarıyordu).
  useFocusEffect(
    useCallback(() => {
      loadToday();
      if (!scopeReady) return;
      const stale = consumeFeedStale();
      const isFresh = Date.now() - lastLoadedAtRef.current < REFRESH_THROTTLE_MS;
      if (!stale && isFresh && hasPostsRef.current) return;
      loadFirstPage(hasPostsRef.current);
    }, [loadFirstPage, loadToday, scopeReady])
  );

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
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id ? { ...p, likedByMe: !wasLiked, likeCount: p.likeCount + (wasLiked ? -1 : 1) } : p
      )
    );
    try {
      const result = wasLiked ? await unlikePost(post.id) : await likePost(post.id);
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, likedByMe: result.liked, likeCount: result.likeCount } : p))
      );
    } catch {
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, likedByMe: wasLiked, likeCount: post.likeCount } : p))
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

  const stat = (value: number | undefined) => (today ? String(value ?? 0) : '—');

  const header = (
    <View style={{ gap: t.space[6], paddingBottom: t.space[6] }}>
      <SearchBox
        placeholder="Kumaş, iplik veya firma ara"
        accessibilityLabel="Arama yap"
        onPress={() => navigation.navigate('GlobalSearch')}
      />

      {/* Bugün */}
      <View style={{ gap: t.space[3] }}>
        {/* Artboard 1: "Bugün" solda, firma adı sağda (tek satır, kısaltılır). */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: t.space[3] }}>
          <Text style={[t.type.title18, { color: t.colors.ink }]}>Bugün</Text>
          {today?.companyName ? (
            <Text numberOfLines={1} style={[t.type.body14, { color: t.colors.ink2, flexShrink: 1 }]}>
              {today.companyName}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: t.space[3] }}>
          <StatCard
            value={stat(today?.pendingSamples)}
            label="Bekleyen numune"
            accent
            onPress={() => navigation.navigate('Requests')}
          />
          <StatCard
            value={stat(today?.newQuotes)}
            label="Yeni teklif"
            onPress={() => navigation.navigate('Requests')}
          />
          <StatCard
            value={stat(today?.unreadMessages)}
            label="Okunmamış mesaj"
            onPress={() => navigation.navigate('Conversations')}
          />
        </View>
      </View>

      {/* Kısayollar: 2 sütun */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[3] }}>
        <QuickAction
          style={{ flexBasis: '47%', flexGrow: 1 }}
          icon="business-outline"
          label="Firmalar"
          onPress={() => navigation.navigate('CompaniesDirectory')}
        />
        <QuickAction
          style={{ flexBasis: '47%', flexGrow: 1 }}
          icon="quote"
          label="Teklif iste"
          onPress={() => navigation.navigate('TenderForm')}
        />
        <QuickAction
          style={{ flexBasis: '47%', flexGrow: 1 }}
          icon="calculator"
          label="Hesap araçları"
          onPress={() => navigation.navigate('Calculators')}
        />
        <QuickAction
          style={{ flexBasis: '47%', flexGrow: 1 }}
          icon="sparkles-outline"
          label="Tekstil asistanı"
          onPress={() => navigation.navigate('AssistantTab')}
        />
      </View>

      {/* Sektörden */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minWidth: 0 }}>
        <SectionTitle
          style={{ flex: 1 }}
          title="Sektörden"
          linkLabel={scope === 'all' ? 'Bağlantılarım' : 'Tümü'}
          onLinkPress={() => changeScope(scope === 'all' ? 'connections' : 'all')}
        />
        {/* "+" bant ikonuna sığmadı (bantta en fazla 2 ikon); paylaşma
            eylemi bölüm başlığının sağında sessiz düğme olarak duruyor. */}
        <Button
          kind="quiet"
          icon="plus"
          label="Paylaş"
          onPress={() => navigation.navigate('CreatePost')}
        />
      </View>

      {error && posts.length > 0 ? (
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
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar
        leading="logo"
        title="Avedon"
        actions={[
          {
            icon: 'bell',
            label: 'Bildirimler',
            dot: !!today && today.unreadNotifications > 0,
            onPress: () => navigation.navigate('Notifications'),
          },
          { icon: 'user', label: 'Profilim', onPress: () => navigation.navigate('MyProfile') },
        ]}
      />
      <Screen scroll={false} noPadding>
        <FlatList
          data={loading ? [] : posts}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: t.space[10] }}
          ItemSeparatorComponent={() => <View style={{ height: t.space[4] }} />}
          refreshControl={refreshControl(refreshing, () => {
            setRefreshing(true);
            loadToday();
            loadFirstPage(true);
          })}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={header}
          ListEmptyComponent={
            loading ? (
              <View style={{ gap: t.space[4] }}>
                <Skeleton height={t.size.toolBox * 2} />
                <Skeleton height={t.size.toolBox * 2} />
              </View>
            ) : error ? (
              <EmptyState
                icon="warning"
                title="Akış alınamadı"
                description={error}
                actionLabel="Tekrar dene"
                onAction={() => loadFirstPage()}
              />
            ) : (
              <EmptyState
                icon="home"
                title="Firmaları takip et, yenilikleri burada gör"
                description="Bağlantı kurduğun firmaların paylaşımları bu akışta listelenir."
                actionLabel="Firmaları keşfet"
                onAction={() => navigation.navigate('Connections')}
              />
            )
          }
          ListFooterComponent={
            cursor ? (
              <ActivityIndicator style={{ marginVertical: t.space[4] }} color={t.colors.brand} />
            ) : null
          }
          renderItem={({ item }) => (
            <PostCard
              post={item}
              isMine={item.author.id === user?.id}
              myCompanyId={user?.companyId ?? null}
              onToggleLike={handleToggleLike}
              onRequestQuote={(p) =>
                p.product &&
                navigation.navigate('QuoteRequestForm', {
                  productId: p.product.id,
                  productCode: p.product.code,
                  stockUnit: p.product.stockUnit,
                })
              }
              onOpenComments={(post) => navigation.navigate('PostComments', { postId: post.id })}
              onOpenAuthor={(post) => navigation.navigate('Profile', { userId: post.author.id })}
              onOpenProduct={(post) =>
                post.product && navigation.navigate('ProductDetail', { productId: post.product.id })
              }
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
      </Screen>
    </View>
  );
}

// İstatistik kutusu bir karta oturuyor (artboard 1): dokununca ilgili ekran.
// `Card onPress` kullanılmıyor — o, sağa chevron koyup üç sütunda etiketi
// harf harf kırıyordu; kartın kendisi Pressable.
function StatCard({
  value,
  label,
  accent,
  onPress,
}: {
  value: string;
  label: string;
  accent?: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        padding: t.space[3],
        borderRadius: t.radius.lg,
        borderWidth: 1,
        borderColor: t.colors.line,
        backgroundColor: pressed ? t.colors.surface2 : t.colors.surface1,
      })}
    >
      <StatBox value={value} label={label} accent={accent} />
    </Pressable>
  );
}
