// Teklif istekleri listesi (yeni tasarım, 4. adım — DESIGN.md §2/§3).
// Kalıp: screens/requests/RequestsScreen.tsx (SegmentControl + ListRow + Badge).
// Veri katmanı Faz 2, Adım 2 / Faz 3, Adım 1'deki gibi; yalnızca görünüm yeni.
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import { fetchQuoteRequests, fetchRfqs, type QuoteRequestRow, type RfqSummary } from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { formatQuantity } from '../../features/quotes/format';
import { formatRelativeTime } from '../../features/time';
import { useFocusLoad } from '../../features/useFocusLoad';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import {
  useBottomPadding,
  AppBar,
  Badge,
  Button,
  EmptyState,
  Icon,
  ListRow,
  Screen,
  SectionTitle,
  SegmentControl,
  SkeletonRow,
  type BadgeKind,
} from '../../ui';
import { tr } from '../../i18n';

type Props = RootStackScreenProps<'QuoteRequests'>;

type Role = 'buyer' | 'seller';

// Teklif isteği durumu → rozet (components/QuoteStatusBadge ile aynı eşleme).
const QUOTE_BADGE = (): Record<QuoteRequestRow['status'], { kind: BadgeKind; label: string }> => ({
  open: { kind: 'pending', label: tr('Teklif bekleniyor') },
  quoted: { kind: 'info', label: tr('Teklif verildi') },
  accepted: { kind: 'delivered', label: tr('Kabul edildi') },
  declined: { kind: 'cancelled', label: tr('Reddedildi') },
  cancelled: { kind: 'cancelled', label: tr('Geri çekildi') },
});

// Faz 2, Adım 2. İki sekme tek yüklemede geliyor: sekme değişince ekran
// yeniden istek atmıyor, liste anında değişiyor.
export function QuoteRequestsScreen({ route, navigation }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const { user } = useSession();
  const hasCompany = !!user?.companyId;
  const [role, setRole] = useState<Role>(route.params?.role === 'seller' && hasCompany ? 'seller' : 'buyer');

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(async () => {
    const [buyer, seller, rfqs] = await Promise.all([
      fetchQuoteRequests('buyer'),
      hasCompany ? fetchQuoteRequests('seller') : Promise.resolve({ requests: [] as QuoteRequestRow[] }),
      // Faz 3, Adım 1: çoklu istekler (karşılaştırmalar) yalnızca alıcıda.
      // Eski sunucuda bu uç yok: hata listeyi düşürmesin.
      fetchRfqs().catch(() => ({ rfqs: [] as RfqSummary[] })),
    ]);
    return { buyer: buyer.requests, seller: seller.requests, rfqs: rfqs.rfqs };
  });

  const requests = (role === 'seller' ? data?.seller : data?.buyer) ?? [];
  const rfqs = role === 'buyer' ? (data?.rfqs ?? []) : [];

  const switchRole = (next: Role) => {
    if (next === role) return;
    haptics.selection();
    setRole(next);
  };

  const shell = (children: React.ReactNode) => (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title={tr('Tekliflerim')} leading="back" onBack={() => navigation.goBack()} />
      {children}
    </View>
  );

  if (status === 'loading') {
    return shell(
      <Screen>
        <View style={{ gap: t.space[4] }}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      </Screen>
    );
  }

  if (status === 'error') {
    return shell(
      <Screen>
        <EmptyState
          icon="warning"
          title={tr('Yüklenemedi')}
          description={friendlyMessage(error, tr('Teklif istekleri alınamadı'))}
          actionLabel={tr('Tekrar dene')}
          onAction={reload}
        />
      </Screen>
    );
  }

  const header = (
    <View style={{ gap: t.space[3], paddingBottom: t.space[3] }}>
      {hasCompany ? (
        <SegmentControl<Role>
          stretch
          accessibilityLabel={tr('Yön')}
          value={role}
          onChange={switchRole}
          options={[
            { value: 'buyer', label: tr('Verdiğim istekler') },
            { value: 'seller', label: tr('Gelen istekler') },
          ]}
        />
      ) : null}
      {error ? (
        <View style={{ gap: t.space[2] }}>
          <View
            accessibilityRole="alert"
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
            <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>
              {friendlyMessage(error, tr('Teklif istekleri alınamadı'))}
            </Text>
          </View>
          <Button kind="secondary" label={tr('Tekrar dene')} onPress={reload} />
        </View>
      ) : null}
      {/* Çoklu istekler (Faz 3, Adım 1): her satır bir karşılaştırma. */}
      {rfqs.length ? (
        <View style={{ gap: t.space[2] }}>
          <SectionTitle title={tr('Karşılaştırmalar ({n})', { n: rfqs.length })} />
          <View>
            {rfqs.map((rfq, index) => (
              <ListRow
                key={rfq.id}
                title={rfq.title}
                subtitle={`${tr('{a} firmadan {b} teklif', { a: rfq.requestCount, b: rfq.quotedCount })} · ${formatQuantity(rfq.quantity, rfq.unit)} · ${formatRelativeTime(rfq.createdAt)}`}
                left={
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
                    <Icon name="git-compare-outline" size={t.size.iconSm} color="brand" />
                  </View>
                }
                divider={index < rfqs.length - 1}
                onPress={() => navigation.navigate('RfqCompare', { rfqId: rfq.id })}
              />
            ))}
          </View>
          <SectionTitle title={tr('Tek tek istekler ({n})', { n: requests.length })} style={{ paddingTop: t.space[3] }} />
        </View>
      ) : null}
    </View>
  );

  const empty =
    role === 'seller' ? (
      <EmptyState
        icon="quote"
        title={tr('Henüz gelen teklif isteği yok')}
        description={tr('Ürünlerinize teklif isteği geldiğinde burada görünür ve teklifinizi buradan hazırlarsınız.')}
      />
    ) : (
      <EmptyState
        icon="quote"
        title={tr('Henüz teklif isteğiniz yok')}
        description={tr('Beğendiğiniz ürünün sayfasından teklif isteyebilir, gelen teklifi buradan yanıtlayabilirsiniz.')}
        actionLabel={tr('Ürünlere göz at')}
        onAction={() => navigation.navigate('MainTabs', { screen: 'ProductList' })}
      />
    );

  return shell(
    <Screen scroll={false} noPadding>
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: bottomPad }}
        refreshControl={refreshControl(refreshing, refresh)}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        renderItem={({ item, index }) => {
          const counterparty =
            role === 'seller'
              ? [item.buyer.name, item.buyer.company?.name].filter(Boolean).join(' · ')
              : item.sellerCompany.name;
          const badge = QUOTE_BADGE()[item.status] ?? QUOTE_BADGE().open;
          return (
            <ListRow
              title={item.product.code}
              subtitle={`${counterparty} · ${formatQuantity(item.quantity, item.unit)} · ${formatRelativeTime(item.updatedAt)}`}
              avatarName={counterparty || item.product.code}
              avatarKind={role === 'seller' ? 'person' : 'company'}
              right={<Badge kind={badge.kind} label={badge.label} />}
              divider={index < requests.length - 1}
              onPress={() => navigation.navigate('QuoteRequestDetail', { requestId: item.id })}
            />
          );
        }}
      />
    </Screen>
  );
}
