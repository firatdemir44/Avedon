// Gönderdiğim numune talepleri (yeni tasarım, 4. adım — DESIGN.md §2/§3).
// Veri katmanı değişmedi: GET /sample-requests?as=requester; satıra dokununca
// aynı takip rotası. Kalıp `screens/requests/RequestsScreen.tsx` ile aynı.
import React, { useEffect } from 'react';
import { FlatList, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { fetchMySampleRequests } from '../../api/client';
import type { SampleRequestStatus } from '../../types';
import { friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { formatRelativeTime } from '../../features/time';
import { useFocusLoad } from '../../features/useFocusLoad';
import { useTheme } from '../../theme/ThemeContext';
import {
  useBottomPadding,
  AppBar,
  Badge,
  EmptyState,
  Icon,
  ListRow,
  Screen,
  SkeletonRow,
  type BadgeKind,
} from '../../ui';
import { tr } from '../../i18n';

type Props = RootStackScreenProps<'MySampleRequests'>;

const SAMPLE_BADGE: Record<SampleRequestStatus, BadgeKind> = {
  talep_edildi: 'pending',
  onaylandi: 'info',
  hazirlandi: 'info',
  teslim_edildi: 'delivered',
};

export function MySampleRequestsScreen({ navigation }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchMySampleRequests().then(({ sampleRequests }) => sampleRequests)
  );
  const requests = data ?? [];

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const banner = error ? friendlyMessage(error, tr('Talepler alınamadı')) : null;

  const header = banner ? (
    <View style={{ paddingBottom: t.space[3] }}>
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
    </View>
  ) : null;

  const bar = <AppBar title={tr('Taleplerim')} leading="back" onBack={() => navigation.goBack()} />;

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
        <Screen scroll={false}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </Screen>
      </View>
    );
  }

  if (status === 'error' && requests.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
        <Screen>
          <EmptyState
            icon="warning"
            title={tr('Talepler alınamadı')}
            description={friendlyMessage(error, tr('Bağlantıyı kontrol edip yeniden dene.'))}
            actionLabel={tr('Yeniden dene')}
            onAction={reload}
          />
        </Screen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      {bar}
      <Screen scroll={false} noPadding>
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: bottomPad }}
          refreshControl={refreshControl(refreshing, refresh)}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState
              icon="sample"
              title={tr('İlk numune talebini gönder')}
              description={tr('Beğendiğin ürünün sayfasından numune isteyebilir, süreci buradan adım adım takip edebilirsin.')}
              actionLabel={tr('Kataloğa git')}
              onAction={() => navigation.navigate('MainTabs', { screen: 'ProductList' })}
            />
          }
          renderItem={({ item, index }) => (
            <ListRow
              title={item.product.code}
              subtitle={`${item.product.company.name} · ${item.deliveryModeLabel} · ${formatRelativeTime(item.createdAt)}`}
              avatarName={item.product.company.name}
              avatarKind="company"
              right={<Badge kind={SAMPLE_BADGE[item.status]} label={item.statusLabel} />}
              divider={index < requests.length - 1}
              onPress={() => navigation.navigate('SampleRequestTracking', { sampleRequestId: item.id })}
            />
          )}
        />
      </Screen>
    </View>
  );
}
