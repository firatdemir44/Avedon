// Talepler sekmesi (yeni tasarım, 3. adım — DESIGN.md §8, artboard 7).
//
// Tek ekranda dört liste: numune/teklif × gönderdiğim/gelen. Veri katmanı
// eski ekranlarla (MySampleRequests, IncomingSampleRequests, QuoteRequests)
// AYNI uçlardan geliyor; o rotalar da yerinde duruyor (bildirimler ve eski
// bağlantılar oraya gidiyor). Burada yalnızca görünüm yeni: SegmentControl +
// ListRow + Badge.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import type { MainTabScreenProps } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import {
  fetchIncomingSampleRequests,
  fetchMySampleRequests,
  fetchQuoteRequests,
  updateSampleRequestStatus,
  type QuoteRequestRow,
  type SampleRequestRow,
} from '../../api/client';
import type { SampleRequestStatus } from '../../types';
import { useFocusLoad } from '../../features/useFocusLoad';
import { refreshControl } from '../../components/refresh';
import { friendlyMessage } from '../../components/StateView';
import { formatRelativeTime } from '../../features/time';
import { formatQuantity } from '../../features/quotes/format';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import {
  AppBar,
  Badge,
  Button,
  EmptyState,
  Icon,
  ListRow,
  Screen,
  SegmentControl,
  SkeletonRow,
  type BadgeKind,
} from '../../ui';

type Props = MainTabScreenProps<'Requests'>;

type Kind = 'sample' | 'quote';
type Side = 'outgoing' | 'incoming';

// Numune durumu → rozet türü (DESIGN.md §3). Metin sunucudan gelen
// `statusLabel`; rozet yalnızca rengi ve ikonu taşır.
const SAMPLE_BADGE: Record<SampleRequestStatus, BadgeKind> = {
  talep_edildi: 'pending',
  onaylandi: 'info',
  hazirlandi: 'info',
  teslim_edildi: 'delivered',
};

const QUOTE_BADGE: Record<QuoteRequestRow['status'], { kind: BadgeKind; label: string }> = {
  open: { kind: 'pending', label: 'Teklif bekliyor' },
  quoted: { kind: 'new', label: 'Teklif geldi' },
  accepted: { kind: 'delivered', label: 'Kabul edildi' },
  declined: { kind: 'cancelled', label: 'Reddedildi' },
  cancelled: { kind: 'cancelled', label: 'İptal' },
};

export function RequestsScreen({ navigation }: Props) {
  const t = useTheme();
  const { user } = useSession();
  const hasCompany = !!user?.companyId;

  const [kind, setKind] = useState<Kind>('sample');
  const [side, setSide] = useState<Side>('outgoing');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Dört liste tek yüklemede: segment değişince yeniden istek atılmıyor.
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(async () => {
    const [mine, incoming, buyerQuotes, sellerQuotes] = await Promise.all([
      fetchMySampleRequests().then((r) => r.sampleRequests),
      hasCompany
        ? fetchIncomingSampleRequests().then((r) => r.sampleRequests)
        : Promise.resolve([] as SampleRequestRow[]),
      fetchQuoteRequests('buyer').then((r) => r.requests),
      hasCompany
        ? fetchQuoteRequests('seller').then((r) => r.requests)
        : Promise.resolve([] as QuoteRequestRow[]),
    ]);
    return { mine, incoming, buyerQuotes, sellerQuotes };
  });

  const samples = (side === 'incoming' ? data?.incoming : data?.mine) ?? [];
  const quotes = (side === 'incoming' ? data?.sellerQuotes : data?.buyerQuotes) ?? [];

  const rows = useMemo<Array<SampleRequestRow | QuoteRequestRow>>(
    () => (kind === 'sample' ? samples : quotes),
    [kind, samples, quotes]
  );

  const advanceSample = async (row: SampleRequestRow) => {
    if (!row.nextStep) return;
    setUpdatingId(row.id);
    setActionError(null);
    try {
      await updateSampleRequestStatus(row.id, row.nextStep.status);
      haptics.success();
      await reload();
    } catch (err) {
      haptics.error();
      setActionError(friendlyMessage(err, 'Durum güncellenemedi'));
    } finally {
      setUpdatingId(null);
    }
  };

  const banner = actionError ?? (error ? friendlyMessage(error, 'Talepler alınamadı') : null);

  const header = (
    <View style={{ gap: t.space[3], paddingBottom: t.space[3] }}>
      <SegmentControl<Kind>
        stretch
        accessibilityLabel="Talep türü"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'sample', label: 'Numune' },
          { value: 'quote', label: 'Teklif' },
        ]}
      />
      {/* Firması olmayan kullanıcıya gelen talep gelmez; ikinci segment gizli. */}
      {hasCompany ? (
        <SegmentControl<Side>
          stretch
          accessibilityLabel="Yön"
          value={side}
          onChange={setSide}
          options={[
            { value: 'outgoing', label: 'Gönderdiğim' },
            { value: 'incoming', label: 'Gelen' },
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
    kind === 'sample' ? (
      side === 'incoming' ? (
        <EmptyState
          icon="sample"
          title="Henüz gelen talep yok"
          description="Ürünlerinize numune talebi geldiğinde burada görünür."
        />
      ) : (
        <EmptyState
          icon="sample"
          title="İlk numune talebini gönder"
          description='Katalogdan bir kumaş seçip "Numune talep et" dediğinde talep burada listelenir.'
          actionLabel="Kataloğa git"
          onAction={() => navigation.navigate('ProductList')}
        />
      )
    ) : side === 'incoming' ? (
      <EmptyState
        icon="quote"
        title="Henüz gelen teklif isteği yok"
        description="Ürünlerinize teklif isteği geldiğinde burada görünür."
      />
    ) : (
      <EmptyState
        icon="quote"
        title="İlk teklif isteğini gönder"
        description="Bir ürün sayfasından teklif isteyebilir, gelen teklifi buradan yanıtlayabilirsin."
        actionLabel="Kataloğa git"
        onAction={() => navigation.navigate('ProductList')}
      />
    );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar
        title="Talepler"
        actions={[
          {
            icon: 'bell',
            label: 'Bildirimler',
            onPress: () => navigation.navigate('Notifications'),
          },
        ]}
      />
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
            data={rows}
            keyExtractor={(item) => item.id}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: t.space[10] }}
            refreshControl={refreshControl(refreshing, refresh)}
            ListHeaderComponent={header}
            ListEmptyComponent={empty}
            renderItem={({ item, index }) => {
              const last = index === rows.length - 1;
              if (kind === 'sample') {
                const row = item as SampleRequestRow;
                const who =
                  side === 'incoming'
                    ? `${row.requester.firstName} ${row.requester.lastName}`
                    : row.product.company.name;
                return (
                  <View>
                    <ListRow
                      title={row.product.code}
                      subtitle={`${who} · ${row.deliveryModeLabel} · ${formatRelativeTime(row.createdAt)}`}
                      avatarName={who}
                      avatarKind={side === 'incoming' ? 'person' : 'company'}
                      right={<Badge kind={SAMPLE_BADGE[row.status]} label={row.statusLabel} />}
                      divider={!last || !row.nextStep}
                      onPress={() =>
                        navigation.navigate('SampleRequestTracking', { sampleRequestId: row.id })
                      }
                    />
                    {/* Bir sonraki adım: satırın İÇİNDE değil ALTINDA (iç içe düğme olmaz). */}
                    {row.nextStep ? (
                      <View style={{ paddingBottom: t.space[3] }}>
                        <Button
                          kind="secondary"
                          fullWidth
                          loading={updatingId === row.id}
                          label={`${row.nextStep.label} olarak işaretle`}
                          onPress={() => advanceSample(row)}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              }

              const row = item as QuoteRequestRow;
              const who =
                side === 'incoming'
                  ? [row.buyer.name, row.buyer.company?.name].filter(Boolean).join(' · ')
                  : row.sellerCompany.name;
              const badge = QUOTE_BADGE[row.status];
              return (
                <ListRow
                  title={row.product.code}
                  subtitle={`${who} · ${formatQuantity(row.quantity, row.unit)} · ${formatRelativeTime(row.updatedAt)}`}
                  avatarName={who || row.product.code}
                  avatarKind={side === 'incoming' ? 'person' : 'company'}
                  right={<Badge kind={badge.kind} label={badge.label} />}
                  divider={!last}
                  onPress={() => navigation.navigate('QuoteRequestDetail', { requestId: row.id })}
                />
              );
            }}
          />
        )}
      </Screen>
    </View>
  );
}
