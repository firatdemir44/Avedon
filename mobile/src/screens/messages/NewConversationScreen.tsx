// Yeni sohbet (yeni tasarım, 4. adım — DESIGN.md §3 "Liste satırı").
//
// Bağlantılar `src/ui`'nin `ListRow` bileşeniyle çiziliyor; dokununca sohbet
// açılır (varsa mevcut sohbet). Veri katmanı ve işlev DEĞİŞMEDİ.
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { fetchConnections, startConversation, type ConnectionSummary } from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useFocusLoad } from '../../features/useFocusLoad';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import { useBottomPadding, EmptyState, Icon, ListRow, SkeletonRow } from '../../ui';
import { tr } from '../../i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'NewConversation'>;

export function NewConversationScreen({ navigation }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchConnections().then(({ connections }) => connections)
  );
  const [startingId, setStartingId] = useState<string | null>(null);
  // Eskiden sohbet başlatma hatası yalnızca liste BOŞKEN görünüyordu, yani
  // kişiye dokunup hata alan kullanıcı hiçbir şey görmüyordu.
  const [startError, setStartError] = useState<string | null>(null);
  const connections = data ?? [];

  const handleStart = async (item: ConnectionSummary) => {
    // Bir sohbet açılırken ikinci dokunuş ikinci istek göndermesin.
    if (startingId) return;
    setStartingId(item.user.id);
    setStartError(null);
    try {
      const { conversation } = await startConversation(item.user.id);
      navigation.replace('Chat', {
        conversationId: conversation.id,
        title: `${item.user.firstName} ${item.user.lastName}`,
      });
    } catch (err) {
      haptics.error();
      setStartError(friendlyMessage(err, tr('Sohbet başlatılamadı')));
      setStartingId(null);
    }
  };

  const safeArea = { flex: 1, backgroundColor: t.colors.surface0 } as const;

  if (status === 'loading') {
    return (
      <SafeAreaView style={safeArea} edges={['bottom']}>
        <View style={{ paddingHorizontal: t.space[4], paddingTop: t.space[4], gap: t.space[4] }}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      </SafeAreaView>
    );
  }

  if (status === 'error') {
    return (
      <SafeAreaView style={safeArea} edges={['bottom']}>
        <View style={{ paddingHorizontal: t.space[4] }}>
          <EmptyState
            icon="warning"
            title={tr('Bağlantılar alınamadı')}
            description={friendlyMessage(error, tr('Bağlantıyı kontrol edip tekrar deneyin.'))}
            actionLabel={tr('Tekrar dene')}
            onAction={reload}
          />
        </View>
      </SafeAreaView>
    );
  }

  const bannerMessage = startError ?? (error ? friendlyMessage(error, tr('Bağlantılar alınamadı')) : null);

  return (
    <SafeAreaView style={safeArea} edges={['bottom']}>
      <FlatList
        data={connections}
        keyExtractor={(item) => item.connectionId}
        contentContainerStyle={{
          paddingHorizontal: t.space[4],
          paddingTop: t.space[3],
          paddingBottom: bottomPad,
        }}
        refreshControl={refreshControl(refreshing, refresh, t)}
        ListHeaderComponent={
          bannerMessage ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.space[2],
                marginBottom: t.space[3],
                padding: t.space[3],
                borderRadius: t.radius.md,
                backgroundColor: t.colors.dangerSoft,
              }}
            >
              <Icon name="warning" size={t.size.iconSm} color="danger" />
              <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>
                {bannerMessage}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="user"
            title={tr('Önce bağlantı kurun')}
            description={tr('Mesaj göndermek için kişiyle bağlantıda olmanız gerekir.')}
          />
        }
        renderItem={({ item, index }) => (
          <ListRow
            title={`${item.user.firstName} ${item.user.lastName}`}
            subtitle={startingId === item.user.id ? tr(tr('Sohbet açılıyor')) : item.user.position}
            avatarName={`${item.user.firstName} ${item.user.lastName}`}
            avatarKind="person"
            divider={index < connections.length - 1}
            onPress={() => handleStart(item)}
          />
        )}
      />
    </SafeAreaView>
  );
}
