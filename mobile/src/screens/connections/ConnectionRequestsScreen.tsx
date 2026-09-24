// Bağlantı istekleri (yeni tasarım, 4. adım — DESIGN.md §3).
//
// Veri katmanı AYNI: uçlar, navigasyon hedefleri ve rota adları değişmedi.
// Yalnızca görünüm yeni: `ui/Screen`, `ui/ListRow`, `ui/Button`, `ui/EmptyState`.
// Kişi satırı (profile gider) ile Kabul et / Reddet düğmeleri kardeş öğeler;
// web'de iç içe düğme oluşmuyor.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { fetchIncomingConnectionRequests, respondToConnectionRequest } from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useFocusLoad } from '../../features/useFocusLoad';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import { tr } from '../../i18n';
import { useBottomPadding, Button, EmptyState, Icon, ListRow, Screen, SkeletonRow } from '../../ui';

type Props = NativeStackScreenProps<RootStackParamList, 'ConnectionRequests'>;

export function ConnectionRequestsScreen({ navigation }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchIncomingConnectionRequests().then(({ requests }) => requests)
  );
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const requests = data ?? [];

  const handleRespond = async (id: string, nextStatus: 'accepted' | 'rejected') => {
    setUpdatingId(id);
    setActionError(null);
    try {
      await respondToConnectionRequest(id, nextStatus);
      if (nextStatus === 'accepted') haptics.success();
      await reload();
    } catch (err) {
      haptics.error();
      setActionError(friendlyMessage(err, tr('İşlem yapılamadı')));
    } finally {
      setUpdatingId(null);
    }
  };

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
          title={tr('İstekler alınamadı')}
          description={friendlyMessage(error, tr('İstekler alınamadı'))}
          actionLabel={tr('Tekrar dene')}
          onAction={reload}
        />
      </Screen>
    );
  }

  const bannerMessage = actionError ?? (error ? friendlyMessage(error, tr('İstekler alınamadı')) : null);

  return (
    <Screen scroll={false} noPadding>
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: bottomPad }}
        refreshControl={refreshControl(refreshing, refresh)}
        ListHeaderComponent={
          bannerMessage ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.space[2],
                padding: t.space[3],
                marginBottom: t.space[3],
                borderRadius: t.radius.md,
                backgroundColor: t.colors.dangerSoft,
              }}
            >
              <Icon name="warning" size={t.size.iconSm} color="danger" />
              <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{bannerMessage}</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="person-add-outline"
            title={tr('Bekleyen istek yok')}
            description={tr('Biri size bağlantı isteği gönderdiğinde burada kabul edebilir ya da reddedebilirsiniz.')}
          />
        }
        renderItem={({ item, index }) => {
          const name = `${item.requester.firstName} ${item.requester.lastName}`;
          const busy = updatingId === item.id;
          const last = index === requests.length - 1;
          return (
            <View
              style={{
                paddingBottom: t.space[3],
                borderBottomWidth: last ? 0 : 1,
                borderBottomColor: t.colors.line,
                minWidth: 0,
              }}
            >
              <ListRow
                title={name}
                subtitle={item.requester.position}
                avatarName={name}
                avatarKind="person"
                divider={false}
                onPress={() => navigation.navigate('Profile', { userId: item.requester.id })}
              />
              {/* Düğmeler satırın İÇİNDE değil ALTINDA (iç içe düğme olmaz).
                  Ekranda dolu düğme yok: kenarlıklı + tehlikeli. */}
              <View style={{ flexDirection: 'row', gap: t.space[2], minWidth: 0 }}>
                <Button
                  kind="secondary"
                  icon="check"
                  label={tr('Kabul et')}
                  loading={busy}
                  disabled={busy}
                  accessibilityLabel={tr('{name} isteğini kabul et', { name })}
                  onPress={() => void handleRespond(item.id, 'accepted')}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <Button
                  kind="danger"
                  icon="x"
                  label={tr('Reddet')}
                  disabled={busy}
                  accessibilityLabel={tr('{name} isteğini reddet', { name })}
                  onPress={() => void handleRespond(item.id, 'rejected')}
                  style={{ flex: 1, minWidth: 0 }}
                />
              </View>
            </View>
          );
        }}
      />
    </Screen>
  );
}
