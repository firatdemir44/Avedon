// Siparişler listesi (yeni tasarım, 4. adım — DESIGN.md §2/§3).
//
// Veri katmanı Faz 3, Adım 4'teki gibi: iki liste (aldıklarım / sattıklarım)
// tek yüklemede geliyor, sekme değişince istek atılmıyor. Yalnızca görünüm
// yeni: AppBar + SegmentControl + ListRow + Badge + EmptyState.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import { fetchDeals, type DealStatus, type DealView } from '../../api/client';
import { dealStatusLabel } from '../../components/DealStatusBadge';
import { ErrorState, friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { formatQuantity, formatQuoteDate } from '../../features/quotes/format';
import { useFocusLoad } from '../../features/useFocusLoad';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import { tr } from '../../i18n';
import {
  useBottomPadding,
  AppBar,
  Badge,
  EmptyState,
  Icon,
  ListRow,
  Screen,
  SegmentControl,
  SkeletonRow,
  type BadgeKind,
} from '../../ui';

type Props = RootStackScreenProps<'Deals'>;

type Role = 'buyer' | 'seller';

// Sipariş durumu → rozet türü (DESIGN.md §3). Metin `dealStatusLabel`
// ile aynı kaynaktan geliyor; rozet rengi ve ikonu taşır.
const DEAL_BADGE: Record<DealStatus, BadgeKind> = {
  acik: 'info',
  teslim_bildirildi: 'pending',
  teslim_edildi: 'delivered',
  itiraz: 'cancelled',
  iptal: 'cancelled',
};

export function DealsScreen({ route, navigation }: Props) {
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
    const [buyer, seller] = await Promise.all([
      fetchDeals('buyer'),
      hasCompany ? fetchDeals('seller') : Promise.resolve({ deals: [] as DealView[] }),
    ]);
    return { buyer: buyer.deals, seller: seller.deals };
  });

  const deals = (role === 'seller' ? data?.seller : data?.buyer) ?? [];

  const switchRole = (next: Role) => {
    if (next === role) return;
    haptics.selection();
    setRole(next);
  };

  const bar = <AppBar title={tr('Siparişler')} leading="back" onBack={() => navigation.goBack()} />;

  if (status === 'error') {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
        <ErrorState error={error} fallback={tr('Siparişler alınamadı')} onRetry={reload} />
      </View>
    );
  }

  const banner = error ? friendlyMessage(error, tr('Siparişler alınamadı')) : null;

  const header = (
    <View style={{ gap: t.space[3], paddingBottom: t.space[3] }}>
      {/* Firması olmayan kullanıcı satıcı olamaz: seçim hiç çizilmez. */}
      {hasCompany ? (
        <SegmentControl<Role>
          stretch
          accessibilityLabel={tr('Sipariş yönü')}
          value={role}
          onChange={switchRole}
          options={[
            { value: 'buyer', label: tr('Aldıklarım') },
            { value: 'seller', label: tr('Sattıklarım') },
          ]}
        />
      ) : null}
      {banner ? (
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
          <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{banner}</Text>
        </View>
      ) : null}
    </View>
  );

  const empty =
    role === 'seller' ? (
      <EmptyState
        icon="cube-outline"
        title={tr('Henüz satış kaydın yok')}
        description={tr('Alıcı teklifini kabul ettiğinde sipariş kaydı burada açılır.')}
      />
    ) : (
      <EmptyState
        icon="cube-outline"
        title={tr('Henüz sipariş kaydın yok')}
        description={tr('Bir teklifi kabul ettiğinde sipariş kaydı burada açılır.')}
        actionLabel={tr('Tekliflerime git')}
        onAction={() => navigation.navigate('QuoteRequests')}
      />
    );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      {bar}
      <Screen scroll={false} noPadding>
        {status === 'loading' ? (
          <View style={{ paddingHorizontal: t.space[4], gap: t.space[4] }}>
            {header}
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : (
          <FlatList
            data={deals}
            keyExtractor={(item) => item.id}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: bottomPad }}
            refreshControl={refreshControl(refreshing, refresh)}
            ListHeaderComponent={header}
            ListEmptyComponent={empty}
            renderItem={({ item, index }) => {
              const counterparty =
                role === 'seller'
                  ? [item.buyer?.name, item.buyer?.company?.name].filter(Boolean).join(' · ') || tr('Alıcı')
                  : (item.sellerCompany?.name ?? tr('Satıcı firma'));
              const meta = [
                counterparty,
                formatQuantity(item.quantity, item.unit),
                item.agreedDeliveryDate ? tr('termin {date}', { date: formatQuoteDate(item.agreedDeliveryDate) }) : '',
                item.canReview ? tr('değerlendirme bekliyor') : '',
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <ListRow
                  title={item.product.code}
                  subtitle={meta}
                  avatarName={counterparty}
                  avatarKind={role === 'seller' ? 'person' : 'company'}
                  right={<Badge kind={DEAL_BADGE[item.status]} label={dealStatusLabel(item.status)} />}
                  divider={index < deals.length - 1}
                  onPress={() => navigation.navigate('DealDetail', { dealId: item.id })}
                />
              );
            }}
          />
        )}
      </Screen>
    </View>
  );
}
