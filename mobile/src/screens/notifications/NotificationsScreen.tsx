// Bildirimler (yeni tasarım, 4. adım — DESIGN.md §3 liste satırı + rozet).
//
// Veri katmanı AYNI: uçlar, okundu işaretleme, navigasyon hedefleri ve rota
// adları değişmedi. Yalnızca görünüm yeni: `ui/ListRow` (okunmamış satır için
// `unread`), `ui/Card` içindeki PushSettingsCard, `ui/EmptyState`.
// Üst bant stack navigator'dan geliyor (AppBar burada çizilmez).
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useCallback, useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  fetchNotifications,
  fetchProductDraft,
  markNotificationsRead,
  type AppNotification,
} from '../../api/client';
import { PushSettingsCard } from '../../components/PushSettingsCard';
import { friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useFocusLoad } from '../../features/useFocusLoad';
import { setUnreadNotificationCount } from '../../features/notifications/unreadCount';
import { haptics } from '../../features/haptics';
import { formatRelativeTime } from '../../features/time';
import { useTheme } from '../../theme/ThemeContext';
import { useBottomPadding, EmptyState, Icon, ListRow, Screen, SkeletonRow, type AnyIconName } from '../../ui';
import { tr } from '../../i18n';

type Props = RootStackScreenProps<'Notifications'>;

// Faz 2, Adım 1: uygulama içi bildirimler (push YOK). Satıra dokunmak hem
// bildirimi okundu yapar hem ilgili ekranı açar.
function iconFor(kind: string): AnyIconName {
  if (kind === 'watch_match') return 'bookmark-outline';
  // Açık talep (ihale): tender_new, tender_offer, tender_awarded, tender_closed.
  if (kind === 'tender_awarded') return 'trophy-outline';
  if (kind.startsWith('tender')) return 'megaphone-outline';
  if (kind.startsWith('sample_request')) return 'sample';
  if (kind.startsWith('connection')) return 'people-outline';
  // Teklif akışı (Faz 2, Adım 2): quote_request_new, quote_received,
  // quote_accepted, quote_declined.
  if (kind.startsWith('quote')) return 'pricetag-outline';
  // Sipariş kaydı ve karşılıklı değerlendirme (Faz 3, Adım 4).
  if (kind === 'deal_review') return 'star-outline';
  if (kind.startsWith('deal')) return 'sample';
  // Satıcı asistanı (Faz 2, Adım 3): soru geldi / soru cevaplandı.
  if (kind.startsWith('company_question')) return 'sparkles-outline';
  // Karşılıklı referanslar (Faz 2, Adım 7).
  if (kind.startsWith('reference')) return 'ribbon-outline';
  // WhatsApp'tan gelen etiket fotoğrafından hazırlanan ürün taslağı.
  if (kind === 'product_draft') return 'whatsapp';
  // Davetler (Faz 2, Adım 4): davet ettiğiniz kişi katıldı.
  if (kind === 'invite_joined') return 'person-add-outline';
  // Firma doğrulama başvurusu (2026-09-22).
  if (kind === 'verification_approved') return 'shield-checkmark-outline';
  if (kind === 'verification_rejected') return 'shield-outline';
  if (kind === 'verification_request') return 'shield-half-outline';
  if (kind === 'feed_moderation') return 'flag-outline';
  if (kind === 'assistant_digest') return 'stats-chart-outline';
  return 'bell';
}

// Satırın solundaki 40px ikon karesi (DESIGN.md §3: brand-soft zemin, brand ikon).
// `ui` içinde hazır bir "ikon karesi" bileşeni yok; ekran içinde token'larla çözüldü.
function IconSquare({ name }: { name: AnyIconName }) {
  const t = useTheme();
  return (
    <View
      style={{
        width: t.size.avatar,
        height: t.size.avatar,
        borderRadius: t.radius.sm,
        backgroundColor: t.colors.brandSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={name} size={t.size.iconSm} color="brand" />
    </View>
  );
}

export function NotificationsScreen({ navigation }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
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
        .catch(() => setActionError(tr('Bildirim okundu işaretlenemedi.')));
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
        setActionError(tr('Bildirimler okundu işaretlenemedi, tekrar deneyin.'));
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
                ? tr(tr('Bu taslak kullanılmış ya da silinmiş.'))
                : tr(tr('Taslak açılamadı, lütfen tekrar deneyin.'))
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
        navigation.navigate('Admin', { tab: 'requests' });
        return;
      }
      // Akış şikâyeti (2026-09-23): yöneticiye → "Şikâyetler" sekmesi.
      if (item.kind === 'feed_moderation') {
        navigation.navigate('Admin', { tab: 'reports' });
        return;
      }
      if (item.kind === 'verification_approved' || item.kind === 'verification_rejected') {
        navigation.navigate('Verification');
        return;
      }
      // Faz 2, Adım 3: satıcıya gelen soru → gelen sorular listesi; alıcıya
      // gelen cevap → o firmanın asistanı (firma adı bildirimde yok, ekran
      // iplik açılınca sunucudan alır).
      if (item.kind === 'assistant_digest') {
        navigation.navigate('AssistantReport');
        return;
      }
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
      // Açık talep (ihale): hepsi talebin kendi sayfasına.
      if (item.kind.startsWith('tender')) {
        if (item.data.tenderId) navigation.navigate('TenderDetail', { tenderId: item.data.tenderId });
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
      <Screen scroll={false}>
        <View style={{ gap: t.space[4] }}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      </Screen>
    );
  }

  if (status === 'error') {
    return (
      <Screen scroll={false}>
        <EmptyState
          icon="warning"
          title={tr('Bildirimler alınamadı')}
          description={friendlyMessage(error, tr('Bildirimler alınamadı'))}
          actionLabel={tr('Tekrar dene')}
          onAction={reload}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} noPadding>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: bottomPad }}
        refreshControl={refreshControl(refreshing, refresh)}
        ListHeaderComponent={
          <View style={{ gap: t.space[4], paddingBottom: t.space[2] }}>
            {actionError ? (
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
                <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{actionError}</Text>
              </View>
            ) : null}
            {/* Anlık bildirim ayarı (yalnızca web + sunucuda açıkken görünür). */}
            <PushSettingsCard />
            <View>
              {unreadCount > 0 ? (
                <ListRow
                  title={tr('Tümünü okundu say')}
                  subtitle={tr('{n} okunmamış bildirim', { n: unreadCount })}
                  left={<IconSquare name="check" />}
                  unread
                  unreadCount={unreadCount}
                  onPress={markAllRead}
                />
              ) : null}
              <ListRow
                title={tr('İzlediklerim')}
                subtitle={tr('Yeni ürün çıkınca haber alacağınız süzgeçler')}
                left={<IconSquare name="bell" />}
                divider={false}
                onPress={() => navigation.navigate('WatchRules')}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="bell"
            title={tr('Henüz bildirim yok')}
            description={tr('Bir kaliteyi izlemeye alırsanız yeni ürünler burada görünür.')}
            actionLabel={tr('İzleme kur')}
            onAction={() => navigation.navigate('WatchRules')}
          />
        }
        renderItem={({ item, index }) => (
          <ListRow
            title={item.title}
            subtitle={item.body || undefined}
            divider={index < notifications.length - 1}
            unread={!item.read}
            left={<IconSquare name={iconFor(item.kind)} />}
            time={formatRelativeTime(item.createdAt)}
            onPress={() => open(item)}
          />
        )}
        ListFooterComponent={
          notifications.length ? (
            <Text style={[t.type.body14, { color: t.colors.ink3, paddingTop: t.space[4] }]}>
              {tr('Son 30 bildirim gösterilir.')}
            </Text>
          ) : null
        }
      />
    </Screen>
  );
}
