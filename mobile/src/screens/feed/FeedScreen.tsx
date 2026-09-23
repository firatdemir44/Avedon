// Ana sayfa (yeni tasarım, 3. adım — DESIGN.md §8, artboard 1).
//
// Rota adı `Feed` DEĞİŞMEDİ (başka ekranlar oraya navigate ediyor); sekme
// etiketi "Ana sayfa". Düzen: AppBar (logo + Takyon + zil + profil) → 48px
// arama kutusu → "Bugün" sayaçları → 4 kısayol → "Sektörden" akışı.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Share, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useScrollToTop } from '@react-navigation/native';
import type { MainTabScreenProps } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import {
  deletePost,
  fetchFeed,
  fetchToday,
  likePost,
  muteCompanyInFeed,
  unmuteCompanyInFeed,
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
import { UserAvatar } from '../../components/UserAvatar';
import { AccountSheet } from '../../components/AccountSheet';
import {
  useBottomPadding,
  AppBar,
  Button,
  Chip,
  EmptyState,
  Icon,
  QuickAction,
  Screen,
  SearchBox,
  SectionTitle,
  SegmentControl,
  Skeleton,
  StatBox,
  TakyonMark,
} from '../../ui';

type Props = MainTabScreenProps<'Feed'>;

// Sekme geçişlerinde akışın başa sarmaması için yenileme aralığı.
const REFRESH_THROTTLE_MS = 30000;
const SCOPE_KEY = 'avedon.feedScope';
const FOR_ME_KEY = 'avedon.feedForMe';
const NOTICE_MS = 6000;

export function FeedScreen({ navigation }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  // Uzun akışta yukarı dönüş: "Ana sayfa" sekmesine yeniden dokunmak ya da "En üste" düğmesi.
  const listRef = useRef<FlatList<any>>(null);
  useScrollToTop(listRef);
  const [showTop, setShowTop] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const scrollTop = useCallback(() => { haptics.light?.(); listRef.current?.scrollToOffset({ offset: 0, animated: true }); }, []);
  const { user } = useSession();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<FeedCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Varsayılan "Bağlantılarım" (akış düzeni 2026-09-23); seçim hatırlanır.
  const [scope, setScope] = useState<FeedScope>('connections');
  // "Sektör" sekmesinde "Benim için" süzgeci: varsayılan açık, hatırlanır.
  const [forMe, setForMe] = useState(false);
  const forMeRef = useRef(false);
  forMeRef.current = forMe;
  // Firma gizlendikten sonra kısa bildirim + geri al.
  const [notice, setNotice] = useState<{ text: string; undo?: () => void } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = useCallback((text: string, undo?: () => void) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ text, undo });
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);
  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);
  const [scopeReady, setScopeReady] = useState(false);
  const [today, setToday] = useState<TodaySummary | null>(null);
  const loadingMoreRef = useRef(false);
  const lastLoadedAtRef = useRef(0);
  const hasPostsRef = useRef(false);
  hasPostsRef.current = posts.length > 0;
  const scopeRef = useRef<FeedScope>(scope);
  scopeRef.current = scope;

  useEffect(() => {
    AsyncStorage.multiGet([SCOPE_KEY, FOR_ME_KEY])
      .then((pairs) => {
        const saved = pairs[0]?.[1];
        const savedForMe = pairs[1]?.[1];
        if (saved === 'all' || saved === 'connections') {
          scopeRef.current = saved;
          setScope(saved);
        }
        if (false as boolean && savedForMe === '0') {
          forMeRef.current = false;
          setForMe(false);
        }
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
    const requestedForMe = forMeRef.current;
    const stale = () => scopeRef.current !== requested || forMeRef.current !== requestedForMe;
    return fetchFeed(null, 10, requested, { forMe: requestedForMe })
      .then(({ posts: fetched, nextCursor }) => {
        if (stale()) return;
        setPosts(fetched);
        setCursor(nextCursor);
        setError(null);
        lastLoadedAtRef.current = Date.now();
      })
      .catch((err) => {
        if (stale()) return;
        setError(friendlyMessage(err, 'Akış alınamadı'));
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  const resetAndLoad = () => {
    setPosts([]);
    setCursor(null);
    setError(null);
    lastLoadedAtRef.current = 0;
    hasPostsRef.current = false;
    setLoading(true);
    loadFirstPage();
  };

  const changeScope = (next: FeedScope) => {
    if (next === scope) return;
    haptics.selection();
    scopeRef.current = next;
    setScope(next);
    AsyncStorage.setItem(SCOPE_KEY, next).catch(() => {});
    resetAndLoad();
  };

  const changeForMe = (next: boolean) => {
    if (next === forMe) return;
    haptics.selection();
    forMeRef.current = next;
    setForMe(next);
    AsyncStorage.setItem(FOR_ME_KEY, next ? '1' : '0').catch(() => {});
    resetAndLoad();
  };

  // "Bu firmayı akışımda gizle": onay → sunucu → listeden çıkar, geri al seçeneği.
  const handleMuteCompany = async (post: FeedPost) => {
    const company = post.author.company;
    if (!company) return;
    const confirmed = await confirmAction({
      title: 'Firmayı gizle',
      message: `${company.name} firmasının paylaşımları akışınızda görünmeyecek. Firma bundan haberdar olmaz; Profilim > Gizlediğim Firmalar bölümünden geri alabilirsiniz.`,
      confirmLabel: 'Gizle',
    });
    if (!confirmed) return;
    try {
      await muteCompanyInFeed(company.id);
      haptics.success();
      const removed = posts.filter((p) => p.author.company?.id === company.id);
      setPosts((prev) => prev.filter((p) => p.author.company?.id !== company.id));
      showNotice(`${company.name} akışınızda gizlendi.`, async () => {
        setNotice(null);
        try {
          await unmuteCompanyInFeed(company.id);
          setPosts((prev) => {
            const merged = [...prev, ...removed.filter((r) => !prev.some((p) => p.id === r.id))];
            return merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
          });
        } catch (err) {
          setError(friendlyMessage(err, 'Geri alınamadı'));
        }
      });
    } catch (err) {
      haptics.error();
      setError(friendlyMessage(err, 'Firma gizlenemedi'));
    }
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
    const requestedForMe = forMeRef.current;
    try {
      const { posts: older, nextCursor } = await fetchFeed(cursor, 10, requested, { forMe: requestedForMe });
      if (scopeRef.current !== requested || forMeRef.current !== requestedForMe) return;
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
    Share.share({ message: `${author} (Takyon):\n\n${post.body}` }).catch(() => {});
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
          icon="globe-outline"
          label="Dünyayı Keşfet"
          onPress={() => navigation.navigate('ExportRadar')}
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
          iconNode={<TakyonMark size={Math.round(t.size.avatar * 0.8)} />}
          label="Tekstil asistanı"
          onPress={() => navigation.navigate('AssistantTab')}
        />
      </View>

      {/* Akış: Bağlantılarım | Genel akış + Paylaş (Fırat 2026-09-23: başlık ve süzgeç kaldırıldı, sade tek satır) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minWidth: 0 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <SegmentControl<FeedScope>
            stretch
            accessibilityLabel="Akışta ne görünsün"
            value={scope}
            onChange={changeScope}
            options={[
              { value: 'connections', label: 'Bağlantılarım' },
              { value: 'all', label: 'Genel akış' },
            ]}
          />
        </View>
        <Button kind="quiet" icon="plus" label="Paylaş" onPress={() => navigation.navigate('CreatePost')} />
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
        title="Takyon"
        actions={[
          {
            icon: 'bell',
            label: 'Bildirimler',
            dot: !!today && today.unreadNotifications > 0,
            onPress: () => navigation.navigate('Notifications'),
          },
          {
            icon: 'user',
            label: 'Hesabım',
            // Profilim, Görünüm ve Çıkış alt sayfada (Araçlar sekmesinden taşındı).
            onPress: () => setAccountOpen(true),
            // Profil fotoğrafı (yoksa baş harfler); 32px, bant üzerinde beyaz çerçeve.
            content: user ? (
              <View style={{ borderRadius: t.radius.full, borderWidth: 2, borderColor: t.colors.onBrand, overflow: 'hidden' }}>
                <UserAvatar userId={user.id} firstName={user.firstName} lastName={user.lastName} avatarUpdatedAt={user.avatarUpdatedAt ?? null} size={t.size.avatarSm} />
              </View>
            ) : undefined,
          },
        ]}
      />
      <AccountSheet
        visible={accountOpen}
        onClose={() => setAccountOpen(false)}
        onOpenProfile={() => navigation.navigate('MyProfile')}
      />
      <Screen scroll={false} noPadding>
        <FlatList
          ref={listRef}
          onScroll={(e) => {
            const far = e.nativeEvent.contentOffset.y > e.nativeEvent.layoutMeasurement.height * 1.5;
            if (far !== showTop) setShowTop(far);
          }}
          scrollEventThrottle={100}
          data={loading ? [] : posts}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: bottomPad }}
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
            ) : scope === 'connections' ? (
              <EmptyState
                icon="people-outline"
                title="Firmaları takip et, yenilikleri burada gör"
                description="Bağlantı kurduğun firmaların yeni ürünleri ve duyuruları bu akışta çıkar."
                actionLabel="Firmaları keşfet"
                onAction={() => navigation.navigate('CompaniesDirectory')}
              />
            ) : (
              <EmptyState
                icon="home"
                title={forMe ? 'Size uygun paylaşım bulunamadı' : 'Henüz paylaşım yok'}
                description={
                  forMe
                    ? 'Firmanızın işiyle ilgili paylaşım yok. Tüm sektör paylaşımlarına bakabilirsiniz.'
                    : 'Sektörde henüz herkese açık paylaşım yok.'
                }
                actionLabel={forMe ? 'Tümünü göster' : 'Firmaları keşfet'}
                onAction={() => (forMe ? changeForMe(false) : navigation.navigate('CompaniesDirectory'))}
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
              onMuteCompany={handleMuteCompany}
            />
          )}
        />
        {notice ? (
          <View
            accessibilityLiveRegion="polite"
            style={[
              {
                position: 'absolute',
                left: t.space[4],
                right: t.space[4],
                bottom: showTop ? t.space[4] + t.size.touchMin + t.space[3] : t.space[4],
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.space[3],
                paddingLeft: t.space[4],
                paddingRight: t.space[2],
                minHeight: t.size.touchMin,
                borderRadius: t.radius.md,
                backgroundColor: t.colors.ink,
              },
              t.shadowRaised,
            ]}
          >
            <Text style={[t.type.body14, { color: t.colors.surface1, flex: 1, minWidth: 0 }]}>{notice.text}</Text>
            {notice.undo ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Geri al"
                onPress={notice.undo}
                style={({ pressed }) => ({
                  minHeight: t.size.touchMin,
                  justifyContent: 'center',
                  paddingHorizontal: t.space[3],
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={[t.type.label14, { color: t.colors.surface1 }]}>Geri al</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {showTop ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="En üste çık"
            onPress={scrollTop}
            style={({ pressed }) => [
              {
                position: 'absolute',
                right: t.space[4],
                bottom: t.space[4],
                minHeight: t.size.touchMin,
                paddingHorizontal: t.space[4],
                borderRadius: t.radius.full,
                backgroundColor: t.colors.brand,
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.space[2],
                opacity: pressed ? 0.85 : 1,
              },
              t.shadowRaised,
            ]}
          >
            <Icon name="up" color="onBrand" />
            <Text style={[t.type.label14, { color: t.colors.onBrand }]}>En üste</Text>
          </Pressable>
        ) : null}
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
