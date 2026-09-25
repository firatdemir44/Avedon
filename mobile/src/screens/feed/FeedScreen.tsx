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
import { tr } from '../../i18n';
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
  // Aşağı çekip yenilemede Sektör gündemi kartı da yenilenir.
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
        setError(friendlyMessage(err, tr('Akış alınamadı')));
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
      title: tr('Firmayı gizle'),
      message: tr('{name} firmasının paylaşımları akışınızda görünmeyecek. Firma bundan haberdar olmaz; Profilim > Gizlediğim Firmalar bölümünden geri alabilirsiniz.', { name: company.name }),
      confirmLabel: tr('Gizle'),
    });
    if (!confirmed) return;
    try {
      await muteCompanyInFeed(company.id);
      haptics.success();
      const removed = posts.filter((p) => p.author.company?.id === company.id);
      setPosts((prev) => prev.filter((p) => p.author.company?.id !== company.id));
      showNotice(tr('{name} akışınızda gizlendi.', { name: company.name }), async () => {
        setNotice(null);
        try {
          await unmuteCompanyInFeed(company.id);
          setPosts((prev) => {
            const merged = [...prev, ...removed.filter((r) => !prev.some((p) => p.id === r.id))];
            return merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
          });
        } catch (err) {
          setError(friendlyMessage(err, tr('Geri alınamadı')));
        }
      });
    } catch (err) {
      haptics.error();
      setError(friendlyMessage(err, tr('Firma gizlenemedi')));
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
      title: tr('Gönderiyi sil'),
      message: tr('Bu gönderi kalıcı olarak silinecek.'),
      confirmLabel: tr('Sil'),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deletePost(post.id);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      haptics.success();
    } catch (err) {
      haptics.error();
      setError(friendlyMessage(err, tr('Gönderi silinemedi')));
    }
  };

  const stat = (value: number | undefined) => (today ? String(value ?? 0) : '—');

  const header = (
    <View style={{ gap: t.space[6], paddingBottom: t.space[4], paddingHorizontal: t.space[4] }}>
      <SearchBox
        placeholder={tr('Kumaş, iplik veya firma ara')}
        accessibilityLabel={tr('Arama yap')}
        onPress={() => navigation.navigate('GlobalSearch')}
        trailingAction={{ icon: 'camera', label: tr('Fotoğrafla benzer kumaş ara'), onPress: () => navigation.navigate('SimilarSearch') }}
      />

      {/* Bugün */}
      <View style={{ gap: t.space[3] }}>
        {/* Artboard 1: "Bugün" solda, firma adı sağda (tek satır, kısaltılır). */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: t.space[3] }}>
          <Text style={[t.type.title18, { color: t.colors.ink }]}>{tr('Bugün')}</Text>
          {today?.companyName ? (
            // Kendi firmasına tek dokunuşla (Fırat 2026-09-24: "firmaya giriş kolay olsun").
            <Pressable
              onPress={() => navigation.navigate('CompanyProfile')}
              accessibilityRole="button"
              accessibilityLabel={tr('Firmam: {name}', { name: today.companyName })}
              hitSlop={t.space[2]}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: t.space[1], flexShrink: 1, opacity: pressed ? 0.6 : 1 })}
            >
              <Text numberOfLines={1} style={[t.type.label14, { color: t.colors.brand, flexShrink: 1 }]}>
                {today.companyName}
              </Text>
              <Icon name="chevron" size={t.size.iconSm} color="brand" />
            </Pressable>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: t.space[3] }}>
          <StatCard
            value={stat(today?.pendingSamples)}
            label={tr('Bekleyen numune')}
            accent
            onPress={() => navigation.navigate('Requests')}
          />
          <StatCard
            value={stat(today?.newQuotes)}
            label={tr('Yeni teklif')}
            onPress={() => navigation.navigate('Requests')}
          />
          <StatCard
            value={stat(today?.unreadMessages)}
            label={tr('Okunmamış mesaj')}
            onPress={() => navigation.navigate('Conversations')}
          />
        </View>
      </View>

      {/* Kısayollar: 2 sütun */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[3] }}>
        <QuickAction
          style={{ flexBasis: '47%', flexGrow: 1 }}
          icon="globe-outline"
          label={tr('Dünyayı Keşfet')}
          onPress={() => navigation.navigate('ExportRadar')}
        />
        <QuickAction
          style={{ flexBasis: '47%', flexGrow: 1 }}
          icon="quote"
          label={tr('Teklif iste')}
          onPress={() => navigation.navigate('TenderForm')}
        />
        <QuickAction
          style={{ flexBasis: '47%', flexGrow: 1 }}
          icon="calculator"
          label={tr('Hesap araçları')}
          onPress={() => navigation.navigate('Calculators')}
        />
        <QuickAction
          style={{ flexBasis: '47%', flexGrow: 1 }}
          icon="sample"
          label={tr('Talepler')}
          dot={(today?.pendingSamples ?? 0) + (today?.newQuotes ?? 0) > 0}
          onPress={() => navigation.navigate('Requests')}
        />
      </View>

      {/* Akış: Bağlantılarım | Genel akış + Paylaş (Fırat 2026-09-23: başlık ve süzgeç kaldırıldı, sade tek satır) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minWidth: 0 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <SegmentControl<FeedScope>
            stretch
            accessibilityLabel={tr('Akışta ne görünsün')}
            value={scope}
            onChange={changeScope}
            options={[
              { value: 'connections', label: tr('Bağlantılarım') },
              { value: 'all', label: tr('Genel akış') },
            ]}
          />
        </View>
        <Button kind="quiet" icon="plus" label={tr('Paylaş')} onPress={() => navigation.navigate('CreatePost')} />
      </View>

      {/* Sektör gündemi: firma türüne göre günün başlıkları (iki akış sekmesinde de). */}
      {/* Sektör gündemi kartı Fırat'ın kararıyla şimdilik kaldırıldı (2026-09-24: akışa yoğunluk veriyor). Bileşen ve SectorNews ekranı duruyor. */}

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
        title="Takyon Texflow"
        actions={[
          {
            icon: 'bell',
            label: tr('Bildirimler'),
            dot: !!today && today.unreadNotifications > 0,
            onPress: () => navigation.navigate('Notifications'),
          },
          {
            icon: 'user',
            label: tr('Hesabım'),
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
        onOpenCompany={user?.companyId ? () => navigation.navigate('CompanyProfile') : undefined}
        company={today?.companyId && today.companyName ? { id: today.companyId, name: today.companyName, logoUpdatedAt: today.companyLogoUpdatedAt ?? null } : null}
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
          // Gönderiler tam genişlik (LinkedIn gibi); arada space-2 yüksekliğinde
          // surface-2 bant. Üst bölüm ve boş durum kendi 16px boşluğunu taşır.
          contentContainerStyle={{ paddingBottom: bottomPad }}
          ItemSeparatorComponent={FeedGap}
          refreshControl={refreshControl(refreshing, () => {
            setRefreshing(true);
            loadToday();
            loadFirstPage(true);
          })}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={{ paddingHorizontal: t.space[4] }}>
            {loading ? (
              <View style={{ gap: t.space[4] }}>
                <Skeleton height={t.size.toolBox * 2} />
                <Skeleton height={t.size.toolBox * 2} />
              </View>
            ) : error ? (
              <EmptyState
                icon="warning"
                title={tr('Akış alınamadı')}
                description={error}
                actionLabel={tr('Tekrar dene')}
                onAction={() => loadFirstPage()}
              />
            ) : scope === 'connections' ? (
              <EmptyState
                icon="people-outline"
                title={tr('Firmaları takip et, yenilikleri burada gör')}
                description={tr('Bağlantı kurduğun firmaların yeni ürünleri ve duyuruları bu akışta çıkar.')}
                actionLabel={tr('Firmaları keşfet')}
                onAction={() => navigation.navigate('CompaniesDirectory')}
              />
            ) : (
              <EmptyState
                icon="home"
                title={forMe ? tr('Size uygun paylaşım bulunamadı') : tr('Henüz paylaşım yok')}
                description={
                  forMe
                    ? tr('Firmanızın işiyle ilgili paylaşım yok. Tüm sektör paylaşımlarına bakabilirsiniz.')
                    : tr('Sektörde henüz herkese açık paylaşım yok.')
                }
                actionLabel={forMe ? tr('Tümünü göster') : tr('Firmaları keşfet')}
                onAction={() => (forMe ? changeForMe(false) : navigation.navigate('CompaniesDirectory'))}
              />
            )}
            </View>
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
                accessibilityLabel={tr('Geri al')}
                onPress={notice.undo}
                style={({ pressed }) => ({
                  minHeight: t.size.touchMin,
                  justifyContent: 'center',
                  paddingHorizontal: t.space[3],
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={[t.type.label14, { color: t.colors.surface1 }]}>{tr('Geri al')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {showTop ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('En üste çık')}
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
            <Text style={[t.type.label14, { color: t.colors.onBrand }]}>{tr('En üste')}</Text>
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

// Akış gönderileri arası bant (DESIGN.md §3 "Akış gönderisi"): space-2, surface-2.
function FeedGap() {
  const t = useTheme();
  return <View style={{ height: t.space[2], backgroundColor: t.colors.surface2 }} />;
}
