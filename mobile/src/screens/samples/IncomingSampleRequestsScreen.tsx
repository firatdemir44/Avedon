// Gelen numune talepleri (yeni tasarım, 4. adım — DESIGN.md §2/§3).
// Veri katmanı değişmedi: GET /sample-requests?as=company, PATCH .../status.
// Kalıp `screens/requests/RequestsScreen.tsx` ile aynı: ListRow + Badge, bir
// sonraki adım düğmesi satırın ALTINDA (iç içe düğme olmaz).
import React, { useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import {
  fetchIncomingSampleRequests,
  updateSampleRequestStatus,
  type SampleRequestRow,
} from '../../api/client';
import type { SampleRequestStatus } from '../../types';
import { friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { formatRelativeTime } from '../../features/time';
import { useFocusLoad } from '../../features/useFocusLoad';
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
  SkeletonRow,
  type BadgeKind,
} from '../../ui';

type Props = RootStackScreenProps<'IncomingSampleRequests'>;

const SAMPLE_BADGE: Record<SampleRequestStatus, BadgeKind> = {
  talep_edildi: 'pending',
  onaylandi: 'info',
  hazirlandi: 'info',
  teslim_edildi: 'delivered',
};

export function IncomingSampleRequestsScreen({ navigation }: Props) {
  const t = useTheme();
  const { user } = useSession();
  const hasCompany = !!user?.companyId;
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(
    () => fetchIncomingSampleRequests().then(({ sampleRequests }) => sampleRequests),
    { enabled: hasCompany }
  );
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const requests = data ?? [];

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const handleAdvance = async (request: SampleRequestRow) => {
    // Hangi adımın kime açık olduğuna sunucu karar veriyor; nextStep yalnızca
    // bu kullanıcı ilerletebiliyorsa geliyor.
    if (!request.nextStep) return;
    setUpdatingId(request.id);
    setActionError(null);
    try {
      await updateSampleRequestStatus(request.id, request.nextStep.status);
      haptics.success();
      // Liste ekranda kalır, yeni durum sessizce gelir.
      await reload();
    } catch (err) {
      haptics.error();
      setActionError(friendlyMessage(err, 'Durum güncellenemedi'));
    } finally {
      setUpdatingId(null);
    }
  };

  const bar = <AppBar title="Gelen talepler" leading="back" onBack={() => navigation.goBack()} />;

  if (!hasCompany) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
        <Screen>
          <EmptyState
            icon="business-outline"
            title="Bir firmaya bağlı değilsin"
            description="Gelen numune talepleri firma hesaplarında görünür."
          />
        </Screen>
      </View>
    );
  }

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
            title="Talepler alınamadı"
            description={friendlyMessage(error, 'Bağlantıyı kontrol edip yeniden dene.')}
            actionLabel="Yeniden dene"
            onAction={reload}
          />
        </Screen>
      </View>
    );
  }

  const banner = actionError ?? (error ? friendlyMessage(error, 'Talepler alınamadı') : null);

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

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      {bar}
      <Screen scroll={false} noPadding>
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: t.space[10] }}
          refreshControl={refreshControl(refreshing, refresh)}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState
              icon="sample"
              title="Henüz gelen talep yok"
              description="Ürünlerine numune talebi geldiğinde burada görünür ve adımlarını buradan ilerletirsin."
            />
          }
          renderItem={({ item, index }) => {
            const last = index === requests.length - 1;
            const requesterName = `${item.requester.firstName} ${item.requester.lastName}`;
            const parts = [requesterName, item.deliveryModeLabel, formatRelativeTime(item.createdAt)];
            return (
              <View>
                <ListRow
                  title={item.product.code}
                  subtitle={parts.join(' · ')}
                  avatarName={requesterName}
                  avatarKind="person"
                  right={<Badge kind={SAMPLE_BADGE[item.status]} label={item.statusLabel} />}
                  divider={!last || !item.nextStep}
                  onPress={() => navigation.navigate('SampleRequestTracking', { sampleRequestId: item.id })}
                />
                {item.note ? (
                  <Text style={[t.type.body14, { color: t.colors.ink2, paddingTop: t.space[2] }]}>
                    “{item.note}”
                  </Text>
                ) : null}
                {/* Bir sonraki adım: satırın İÇİNDE değil ALTINDA. */}
                {item.nextStep ? (
                  <View style={{ paddingTop: t.space[2], paddingBottom: t.space[3] }}>
                    <Button
                      kind="secondary"
                      fullWidth
                      loading={updatingId === item.id}
                      label={`${item.nextStep.label} olarak işaretle`}
                      onPress={() => handleAdvance(item)}
                    />
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      </Screen>
    </View>
  );
}
