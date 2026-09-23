// Talepler sekmesi (DESIGN.md §8, artboard 7).
//
// Tek segment: Gönderdiğim / Gelen. Her yönde numune, teklif ve açık talep
// (ihale) satırları TEK listede, tarihe göre yeniden eskiye. Her satırda tür
// rozeti (Numune / Teklif / Açık talep) ve durum rozeti. Tür ve durum süzgeci
// üst banttaki süzgeç ikonundan açılan alt sayfada.
//
// Veri katmanı eski ekranlarla (MySampleRequests, IncomingSampleRequests,
// QuoteRequests, Tenders) AYNI uçlardan geliyor; o rotalar yerinde duruyor.
//
// Yön eşlemesi (açık talepler için): Gönderdiğim = benim yayınladıklarım;
// Gelen = başkalarının açık talepleri + teklif verdiklerim (tekrarsız).
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
  fetchTenders,
  type Tender,
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
import { formatTenderQuantity, tenderBadge } from '../../features/tenders/format';
import { useTheme } from '../../theme/ThemeContext';
import {
  useBottomPadding,
  AppBar,
  Badge,
  BottomSheet,
  Button,
  ButtonRow,
  Chip,
  EmptyState,
  Icon,
  ListRow,
  Screen,
  SegmentControl,
  SkeletonRow,
  type BadgeKind,
} from '../../ui';

type Props = MainTabScreenProps<'Requests'>;

type Kind = 'sample' | 'quote' | 'tender';
type Side = 'outgoing' | 'incoming';
// Durum grupları: farklı türlerin durumları süzgeçte tek dilde toplanır.
type StatusGroup = 'waiting' | 'active' | 'done' | 'closed';

const KIND_LABEL: Record<Kind, string> = { sample: 'Numune', quote: 'Teklif', tender: 'Açık talep' };
const KIND_ORDER: Kind[] = ['sample', 'quote', 'tender'];
const STATUS_LABEL: Record<StatusGroup, string> = {
  waiting: 'Bekliyor',
  active: 'Sürüyor',
  done: 'Tamamlandı',
  closed: 'Kapandı',
};
const STATUS_ORDER: StatusGroup[] = ['waiting', 'active', 'done', 'closed'];

// Rozet türü → durum grubu (rozet rengiyle süzgeç grubu aynı anlamı taşır).
const GROUP_OF: Record<BadgeKind, StatusGroup> = {
  pending: 'waiting',
  info: 'active',
  new: 'active',
  verified: 'done',
  delivered: 'done',
  cancelled: 'closed',
};

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

type RowBadge = { kind: BadgeKind; label: string };
type Item =
  | { kind: 'sample'; id: string; date: string; badge: RowBadge; row: SampleRequestRow }
  | { kind: 'quote'; id: string; date: string; badge: RowBadge; row: QuoteRequestRow }
  | { kind: 'tender'; id: string; date: string; badge: RowBadge; row: Tender };

function toTime(iso: string): number {
  const n = new Date(iso).getTime();
  return Number.isNaN(n) ? 0 : n;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export function RequestsScreen({ navigation }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const { user } = useSession();
  const hasCompany = !!user?.companyId;

  const [side, setSide] = useState<Side>('outgoing');
  const [kindFilter, setKindFilter] = useState<Kind[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusGroup[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Tüm listeler tek yüklemede: segment/süzgeç değişince yeniden istek atılmaz.
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(async () => {
    const [mine, incoming, buyerQuotes, sellerQuotes, openTenders, myTenders, offered] = await Promise.all([
      fetchMySampleRequests().then((r) => r.sampleRequests),
      hasCompany
        ? fetchIncomingSampleRequests().then((r) => r.sampleRequests)
        : Promise.resolve([] as SampleRequestRow[]),
      fetchQuoteRequests('buyer').then((r) => r.requests),
      hasCompany ? fetchQuoteRequests('seller').then((r) => r.requests) : Promise.resolve([] as QuoteRequestRow[]),
      fetchTenders('open').then((r) => r.tenders),
      fetchTenders('mine').then((r) => r.tenders),
      hasCompany ? fetchTenders('offered').then((r) => r.tenders) : Promise.resolve([] as Tender[]),
    ]);
    return { mine, incoming, buyerQuotes, sellerQuotes, openTenders, myTenders, offered };
  });

  const allItems = useMemo<Item[]>(() => {
    if (!data) return [];
    const samples = side === 'incoming' ? data.incoming : data.mine;
    const quotes = side === 'incoming' ? data.sellerQuotes : data.buyerQuotes;
    let tenders: Tender[] = data.myTenders;
    if (side === 'incoming') {
      const seen = new Set<string>();
      tenders = [];
      for (const x of [...data.offered, ...data.openTenders.filter((o) => !o.isMine)]) {
        if (seen.has(x.id)) continue;
        seen.add(x.id);
        tenders.push(x);
      }
    }
    const items: Item[] = [
      ...samples.map<Item>((row) => ({
        kind: 'sample',
        id: `s-${row.id}`,
        date: row.createdAt,
        badge: { kind: SAMPLE_BADGE[row.status], label: row.statusLabel },
        row,
      })),
      ...quotes.map<Item>((row) => ({
        kind: 'quote',
        id: `q-${row.id}`,
        date: row.updatedAt,
        badge: QUOTE_BADGE[row.status],
        row,
      })),
      ...tenders.map<Item>((row) => ({
        kind: 'tender',
        id: `t-${row.id}`,
        date: row.createdAt,
        badge: tenderBadge(row),
        row,
      })),
    ];
    return items.sort((a, b) => toTime(b.date) - toTime(a.date));
  }, [data, side]);

  const items = useMemo(
    () =>
      allItems.filter(
        (it) =>
          (kindFilter.length === 0 || kindFilter.includes(it.kind)) &&
          (statusFilter.length === 0 || statusFilter.includes(GROUP_OF[it.badge.kind]))
      ),
    [allItems, kindFilter, statusFilter]
  );
  const filterCount = kindFilter.length + statusFilter.length;
  const clearFilters = () => {
    setKindFilter([]);
    setStatusFilter([]);
  };

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
      {filterCount > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
          <Text style={[t.type.body14, { color: t.colors.ink2, flex: 1, minWidth: 0 }]}>
            {[...kindFilter.map((k) => KIND_LABEL[k]), ...statusFilter.map((s) => STATUS_LABEL[s])].join(' · ')}
          </Text>
          <Button kind="quiet" label="Temizle" onPress={clearFilters} />
        </View>
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
    filterCount > 0 && allItems.length > 0 ? (
      <EmptyState
        icon="filter"
        title="Bu süzgece uyan talep yok"
        description="Süzgeci temizleyip tüm talepleri görebilirsin."
        actionLabel="Süzgeci temizle"
        onAction={clearFilters}
      />
    ) : side === 'incoming' ? (
      <EmptyState
        icon="sample"
        title="Henüz gelen talep yok"
        description={
          hasCompany
            ? 'Ürünlerinize numune ya da teklif isteği geldiğinde veya yeni açık talep yayınlandığında burada görünür.'
            : 'Yeni açık talepler yayınlandığında burada görünür.'
        }
      />
    ) : (
      <EmptyState
        icon="sample"
        title="İlk talebini gönder"
        description='Katalogdan bir kumaş seçip "Numune talep et" ya da teklif iste; gönderdiğin talepler burada listelenir.'
        actionLabel="Kataloğa git"
        onAction={() => navigation.navigate('ProductList')}
      />
    );

  const rightBadges = (it: Item) => (
    <View style={{ alignItems: 'flex-end', gap: t.space[1] }}>
      <Badge kind="info" label={KIND_LABEL[it.kind]} />
      <Badge kind={it.badge.kind} label={it.badge.label} />
    </View>
  );

  const renderItem = ({ item, index }: { item: Item; index: number }) => {
    const last = index === items.length - 1;
    if (item.kind === 'sample') {
      const row = item.row;
      const who = side === 'incoming' ? `${row.requester.firstName} ${row.requester.lastName}` : row.product.company.name;
      return (
        <View>
          <ListRow
            title={row.product.code}
            subtitle={`${who} · ${row.deliveryModeLabel} · ${formatRelativeTime(row.createdAt)}`}
            avatarName={who}
            avatarKind={side === 'incoming' ? 'person' : 'company'}
            right={rightBadges(item)}
            divider={!last || !row.nextStep}
            onPress={() => navigation.navigate('SampleRequestTracking', { sampleRequestId: row.id })}
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
    if (item.kind === 'quote') {
      const row = item.row;
      const who =
        side === 'incoming'
          ? [row.buyer.name, row.buyer.company?.name].filter(Boolean).join(' · ')
          : row.sellerCompany.name;
      return (
        <ListRow
          title={row.product.code}
          subtitle={`${who} · ${formatQuantity(row.quantity, row.unit)} · ${formatRelativeTime(row.updatedAt)}`}
          avatarName={who || row.product.code}
          avatarKind={side === 'incoming' ? 'person' : 'company'}
          right={rightBadges(item)}
          divider={!last}
          onPress={() => navigation.navigate('QuoteRequestDetail', { requestId: row.id })}
        />
      );
    }
    const row = item.row;
    const who = row.buyer.company?.name ?? row.buyer.name;
    return (
      <ListRow
        title={row.title}
        subtitle={`${who} · ${formatTenderQuantity(row.quantity, row.unit)} · ${formatRelativeTime(row.createdAt)}`}
        avatarName={who}
        avatarKind={row.buyer.company ? 'company' : 'person'}
        right={rightBadges(item)}
        divider={!last}
        onPress={() => navigation.navigate('TenderDetail', { tenderId: row.id })}
      />
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar
        title="Talepler"
        actions={[
          {
            icon: 'filter',
            label: filterCount > 0 ? `Süzgeç, ${filterCount} seçili` : 'Süzgeç',
            dot: filterCount > 0,
            onPress: () => setFilterOpen(true),
          },
          {
            icon: 'bell',
            label: 'Bildirimler',
            onPress: () => navigation.navigate('Notifications'),
          },
        ]}
      />
      <Screen
        scroll={false}
        noPadding
        sticky={
          side === 'outgoing' ? (
            <Button size="lg" icon="plus" label="Açık talep yayınla" onPress={() => navigation.navigate('TenderForm')} />
          ) : undefined
        }
      >
        {status === 'loading' ? (
          <View style={{ paddingHorizontal: t.space[4], gap: t.space[4] }}>
            {header}
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: bottomPad }}
            refreshControl={refreshControl(refreshing, refresh)}
            ListHeaderComponent={header}
            ListEmptyComponent={empty}
            renderItem={renderItem}
          />
        )}
      </Screen>
      <BottomSheet visible={filterOpen} onClose={() => setFilterOpen(false)} title="Süzgeç">
        <View style={{ gap: t.space[4] }}>
          <View style={{ gap: t.space[2] }}>
            <Text style={[t.type.label14, { color: t.colors.ink2 }]}>Tür</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
              {KIND_ORDER.map((k) => (
                <Chip
                  key={k}
                  label={KIND_LABEL[k]}
                  selected={kindFilter.includes(k)}
                  onPress={() => setKindFilter((l) => toggle(l, k))}
                />
              ))}
            </View>
          </View>
          <View style={{ gap: t.space[2] }}>
            <Text style={[t.type.label14, { color: t.colors.ink2 }]}>Durum</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
              {STATUS_ORDER.map((s) => (
                <Chip
                  key={s}
                  label={STATUS_LABEL[s]}
                  selected={statusFilter.includes(s)}
                  onPress={() => setStatusFilter((l) => toggle(l, s))}
                />
              ))}
            </View>
          </View>
          <ButtonRow>
            <Button kind="secondary" label="Temizle" disabled={filterCount === 0} onPress={clearFilters} />
            <Button label={`Göster (${items.length})`} onPress={() => setFilterOpen(false)} />
          </ButtonRow>
        </View>
      </BottomSheet>
    </View>
  );
}
