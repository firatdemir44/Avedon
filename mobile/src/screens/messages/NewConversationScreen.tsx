import React, { useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { fetchConnections, startConversation, type ConnectionSummary } from '../../api/client';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { ListRow } from '../../components/ListRow';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { useFocusLoad } from '../../features/useFocusLoad';
import { haptics } from '../../features/haptics';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'NewConversation'>;

// Yeni düzen (5. aşama): bağlantılar çizgili kişi satırları olarak; dokununca
// sohbet açılır (varsa mevcut sohbet).
export function NewConversationScreen({ navigation }: Props) {
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
      setStartError(friendlyMessage(err, 'Sohbet başlatılamadı'));
      setStartingId(null);
    }
  };

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <SkeletonList variant="person" />
      </SafeAreaView>
    );
  }

  if (status === 'error') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ErrorState error={error} fallback="Bağlantılar alınamadı" onRetry={reload} />
      </SafeAreaView>
    );
  }

  const bannerMessage = startError ?? (error ? friendlyMessage(error, 'Bağlantılar alınamadı') : null);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <FlatList
        data={connections}
        keyExtractor={(item) => item.connectionId}
        contentContainerStyle={styles.listContent}
        refreshControl={refreshControl(refreshing, refresh)}
        ListHeaderComponent={
          bannerMessage ? (
            <View style={styles.bannerWrap}>
              <InlineError message={bannerMessage} onRetry={startError ? undefined : reload} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title="Önce bağlantı kurun"
            message="Mesaj göndermek için kişiyle bağlantıda olmanız gerekir. Profiline girip bağlantı isteği gönderebilirsiniz."
          />
        }
        renderItem={({ item, index }) => (
          <ListRow
            title={`${item.user.firstName} ${item.user.lastName}`}
            subtitle={startingId === item.user.id ? 'Sohbet açılıyor' : item.user.position}
            left={<CompanyAvatar name={item.user.firstName} size={36} />}
            divider={index < connections.length - 1}
            onPress={() => handleStart(item)}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingTop: spacing.blockGap, paddingBottom: spacing.xl },
  bannerWrap: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.blockGap },
});
