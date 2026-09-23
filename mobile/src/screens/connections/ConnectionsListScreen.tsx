// Bağlantılarım (yeni tasarım, 4. adım — DESIGN.md §3 liste satırı).
//
// Veri katmanı AYNI: uçlar, navigasyon hedefleri ve rota adları değişmedi.
// Yalnızca görünüm yeni: `ui/Screen`, `ui/ListRow` (kişi avatarı), `ui/Button`,
// `ui/EmptyState`. Üst bant stack navigator'dan geliyor.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React from 'react';
import { View, Text, FlatList } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { fetchConnections } from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useFocusLoad } from '../../features/useFocusLoad';
import { useTheme } from '../../theme/ThemeContext';
import { useBottomPadding, Button, EmptyState, Icon, ListRow, Screen, SkeletonRow } from '../../ui';

type Props = NativeStackScreenProps<RootStackParamList, 'Connections'>;

export function ConnectionsListScreen({ navigation }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchConnections().then(({ connections }) => connections)
  );
  const connections = data ?? [];

  if (status === 'loading') {
    return (
      <Screen scroll={false}>
        <View style={{ gap: t.space[4] }}>
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
          title="Bağlantılar alınamadı"
          description={friendlyMessage(error, 'Bağlantılar alınamadı')}
          actionLabel="Tekrar dene"
          onAction={reload}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} noPadding>
      <FlatList
        data={connections}
        keyExtractor={(item) => item.connectionId}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: bottomPad }}
        refreshControl={refreshControl(refreshing, refresh)}
        ListHeaderComponent={
          <View style={{ gap: t.space[3], paddingBottom: t.space[3] }}>
            {error ? (
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
                <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>
                  {friendlyMessage(error, 'Bağlantılar alınamadı')}
                </Text>
              </View>
            ) : null}
            {/* Faz 2, Adım 4: bağlantı listesi boş ya da dolu olsun, davet
                buradan da başlatılabilsin. */}
            <Button
              kind="secondary"
              icon="person-add-outline"
              label="Davet et"
              onPress={() => navigation.navigate('Invites')}
            />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title="Henüz bağlantınız yok"
            description="Akışta bir kişinin adına dokunup profilinden bağlantı kurabilirsiniz."
            actionLabel="Akışa git"
            onAction={() => navigation.navigate('MainTabs', { screen: 'Feed' })}
          />
        }
        renderItem={({ item, index }) => (
          <ListRow
            title={`${item.user.firstName} ${item.user.lastName}`}
            subtitle={item.user.position}
            avatarName={`${item.user.firstName} ${item.user.lastName}`}
            avatarKind="person"
            divider={index < connections.length - 1}
            onPress={() => navigation.navigate('Profile', { userId: item.user.id })}
          />
        )}
      />
    </Screen>
  );
}
