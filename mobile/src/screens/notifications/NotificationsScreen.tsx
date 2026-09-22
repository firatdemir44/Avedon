import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  fetchNotifications,
  fetchProductDraft,
  markNotificationsRead,
  type AppNotification,
} from '../../api/client';
import { ListRow } from '../../components/ListRow';
import { PushSettingsCard } from '../../components/PushSettingsCard';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useFocusLoad } from '../../features/useFocusLoad';
import { setUnreadNotificationCount } from '../../features/notifications/unreadCount';
import { haptics } from '../../features/haptics';
import { formatRelativeTime } from '../../features/time';
import { colors, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'Notifications'>;

type IconName = keyof typeof Ionicons.glyphMap;

// Faz 2, Adım 1: uygulama içi bildirimler (push YOK). Satıra dokunmak hem
// bildirimi okundu yapar hem ilgili ekranı açar.
function iconFor(kind: string): IconName {
  if (kind === 'watch_match') return 'bookmark';
  if (kind.startsWith('sample_request')) return 'cube-outline';
  if (kind.startsWith('connection')) return 'people-outline';
  // Teklif akışı (Faz 2, Adım 2): quote_request_new, quote_received,
  // quote_accepted, quote_declined.
  if (kind.startsWith('quote')) return 'pricetag-outline';
  // Sipariş kaydı ve karşılıklı değerlendirme (Faz 3, Adım 4).
  if (kind === 'deal_review') return 'star-outline';
  if (kind.startsWith('deal')) return 'cube-outline';
  // Satıcı asistanı (Faz 2, Adım 3): soru geldi / soru cevaplandı.
  if (kind.startsWith('company_question')) return 'sparkles-outline';
  // Karşılıklı referanslar (Faz 2, Adım 7).
  if (kind.startsWith('reference')) return 'ribbon-outline';
  // WhatsApp'tan gelen etiket fotoğrafından hazırlanan ürün taslağı.
  if (kind === 'product_draft') return 'logo-whatsapp';
  // Davetler (Faz 2, Adım 4): davet ettiğiniz kişi katıldı.
  if (kind === 'invite_joined') return 'person-add-outline';
  // Firma doğrulama başvurusu (2026-09-22).
  if (kind === 'verification_approved') return 'shield-checkmark';
  if (kind === 'verification_rejected') return 'shield-outline';
  if (kind === 'verification_request') return 'shield-half-outline';
  return 'notifications-outline';
}

export function NotificationsScreen({ navigation }: Props) {
  const { data, setData, status, error, refreshing, reload, refresh } = useFocusLoad(() => fetchNotifications(30));
  const [actionError, setActionError] = useState<string | null>(null);

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  // Okundu işaretleme ekranı bekletmez: satır hemen okunmuş görünür, sunucu
  // hata verirse sayfa yenilendiğinde gerçek durum geri gelir.
  const markRead = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      setData((prev) => {
        if (!prev) return prev;
        const newlyRead = prev.notifications.filter((n) => ids.includes(n.id) && !n.read).length;
        return {
          notifications: prev.notifications.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)),
          unreadCount: Math.max(0, prev.unreadCount - newlyRead),
        };
      });
      markNotificationsRead({ ids })
        .then(({ unreadCount: fresh }) => {
          setActionError(null);
          setData((prev) => (prev ? { ...prev, unreadCount: fresh } : prev));
          // Sekme başlıklarındaki zil yoklamayı beklemeden düzelsin.
          setUnreadNotificationCount(fresh);
        })
        .catch(() => setActionError('Bildirim okundu işaretlenemedi.'));
    },
    [setData]
  );

  const markAllRead = useCallback(() => {
    setData((prev) => (prev ? { notifications: prev.notifications.map((n) => ({ ...n, read: true })), unreadCount: 0 } : prev));
    markNotificationsRead({ all: true })
      .then(({ unreadCount: fresh }) => {
        haptics.success();
        setActionError(null);
        setData((prev) => (prev ? { ...prev, unreadCount: fresh } : prev));
        setUnreadNotificationCount(fresh);
      })
      .catch(() => {
        haptics.error();
        setActionError('Bildirimler okundu işaretlenemedi, tekrar deneyin.');
      });
  }, [setData]);

  const open = useCallback(
    (item: AppNotification) => {
      if (!item.read) markRead([item.id]);
      const { productId, sampleRequestId, quoteRequestId, userId, companyId, dealId, draftId } =
        item.data ?? {};
      // WhatsApp taslağı: taslağın hâlâ durduğunu doğrulayıp ürün formunu
      // taslakla açar. Taslak kullanılmış/silinmişse (404) kısa bir not.
      if (item.kind === 'product_draft') {
        if (!draftId) {
          navigation.navigate('ProductDrafts');
          return;
        }
        setActionError(null);
        fetchProductDraft(draftId)
          .then(() => navigation.navigate('AddProduct', { draftId }))
          .catch((err) =>
            setActionError(
              err instanceof ApiError && err.status === 404
                ? 'Bu taslak kullanılmış ya da silinmiş.'
                : 'Taslak açılamadı, lütfen tekrar deneyin.'
            )
          );
        return;
      }
      // Faz 3, Adım 4: sipariş bildirimleri ve dealId taşıyan "teklif kabul
      // edildi" bildirimi doğrudan sipariş kaydına gider.
      if (item.kind.startsWith('deal') || (item.kind === 'quote_accepted' && dealId)) {
        if (dealId) navigation.navigate('DealDetail', { dealId });
        else navigation.navigate('Deals');
        return;
      }
      // Firma doğrulama (2026-09-22): yöneticiye gelen başvuru → yönetici
      // ekranı; firmaya gelen sonuç → kendi doğrulama ekranı.
      if (item.kind === 'verification_request') {
        navigation.navigate('Admin');
        return;
      }
      if (item.kind === 'verification_approved' || item.kind === 'verification_rejected') {
        navigation.navigate('Verification');
        return;
      }
      // Faz 2, Adım 3: satıcıya gelen soru → gelen sorular listesi; alıcıya
      // gelen cevap → o firmanın asistanı (firma adı bildirimde yok, ekran
      // iplik açılınca sunucudan alır).
      if (item.kind === 'company_question_new') {
        navigation.navigate('CompanyQuestions');
        return;
      }
      if (item.kind === 'company_question_answered') {
        if (companyId) navigation.navigate('SellerAssistant', { companyId });
        return;
      }
      // Faz 2, Adım 7: onay isteği kendi firma sayfasına (referanslar bölümü
      // en üstte), onay/ret sonucu karşı firmanın sayfasına gider.
      if (item.kind === 'reference_request') {
        navigation.navigate('CompanyProfile', { initialTab: 'about', focus: 'references' });
        return;
      }
      if (item.kind === 'reference_confirmed' || item.kind === 'reference_rejected') {
        navigation.navigate('CompanyProfile', {
          ...(companyId ? { companyId } : {}),
          initialTab: 'about',
          focus: 'references',
        });
        return;
      }
      if (item.kind.startsWith('quote')) {
        if (quoteRequestId) navigation.navigate('QuoteRequestDetail', { requestId: quoteRequestId });
        else navigation.navigate('QuoteRequests', { role: item.kind === 'quote_request_new' ? 'seller' : 'buyer' });
        return;
      }
      if (item.kind === 'watch_match' && productId) {
        navigation.navigate('ProductDetail', { productId });
        return;
      }
      if (item.kind === 'sample_request_new') {
        if (sampleRequestId) navigation.navigate('SampleRequestTracking', { sampleRequestId });
        else navigation.navigate('IncomingSampleRequests');
        return;
      }
      if (item.kind === 'sample_request_status') {
        if (sampleRequestId) navigation.navigate('SampleRequestTracking', { sampleRequestId });
        else navigation.navigate('MySampleRequests');
        return;
      }
      if (item.kind === 'connection_request') {
        navigation.navigate('ConnectionRequests');
        return;
      }
      if (item.kind === 'connection_accepted') {
        if (userId) navigation.navigate('Profile', { userId });
        else navigation.navigate('Connections');
        return;
      }
      // Faz 2, Adım 4: davet ettiğiniz kişi kayıt oldu.
      if (item.kind === 'invite_joined') {
        if (userId) navigation.navigate('Profile', { userId });
        else navigation.navigate('Invites');
        return;
      }
      // Tanınmayan tür: yalnızca okundu olur, ekran değişmez.
      if (productId) navigation.navigate('ProductDetail', { productId });
    },
    [markRead, navigation]
  );

  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        <SkeletonList variant="conversation" />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.screen}>
        <ErrorState error={error} fallback="Bildirimler alınamadı" onRetry={reload} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {actionError ? <InlineError message={actionError} style={styles.banner} /> : null}
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={refreshControl(refreshing, refresh)}
        ListHeaderComponent={
          <>
          {/* Anlık bildirim ayarı (yalnızca web + sunucuda açıkken görünür). */}
          <PushSettingsCard />
          <View style={styles.block}>
            {unreadCount > 0 ? (
              <ListRow
                title="Tümünü okundu say"
                subtitle={`${unreadCount} okunmamış bildirim`}
                left={<Ionicons name="checkmark-done-outline" size={22} color={colors.primary} />}
                chevron={false}
                onPress={markAllRead}
              />
            ) : null}
            <ListRow
              title="İzlediklerim"
              subtitle="Yeni ürün çıkınca haber alacağınız süzgeçler"
              left={<Ionicons name="notifications-outline" size={22} color={colors.primary} />}
              divider={false}
              onPress={() => navigation.navigate('WatchRules')}
            />
          </View>
          </>
        }
        ListEmptyComponent={
          <EmptyState
            compact
            icon="notifications-outline"
            title="Henüz bildirim yok"
            message="Bir kaliteyi izlemeye alırsanız yeni ürünler burada görünür."
            actionLabel="İzleme kur"
            onAction={() => navigation.navigate('WatchRules')}
          />
        }
        renderItem={({ item, index }) => (
          <ListRow
            title={item.title}
            subtitle={item.body || undefined}
            divider={index < notifications.length - 1}
            style={!item.read ? styles.unreadRow : undefined}
            accessibilityLabel={`${item.read ? '' : 'Okunmamış. '}${item.title}${item.body ? `, ${item.body}` : ''}, ${formatRelativeTime(item.createdAt)}`}
            left={
              <View style={styles.leftWrap}>
                <View style={[styles.dot, item.read && styles.dotHidden]} />
                <Ionicons name={iconFor(item.kind)} size={22} color={colors.primary} />
              </View>
            }
            right={<Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>}
            onPress={() => open(item)}
          />
        )}
        ListFooterComponent={
          notifications.length ? (
            <Text style={styles.footerNote}>Son 30 bildirim gösterilir.</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  block: { backgroundColor: colors.surface, marginBottom: spacing.blockGap },
  banner: { margin: spacing.gutter },
  // Okunmamış satır: hafif mavi ton + solda mavi nokta.
  unreadRow: { backgroundColor: colors.accentSoft },
  leftWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.accent },
  dotHidden: { backgroundColor: 'transparent' },
  time: { ...typography.mono, fontSize: 13, lineHeight: 17, color: colors.textMuted },
  footerNote: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
  },
});
