import React, { useState } from 'react';
import { Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { fetchConnections, startConversation, type ConnectionSummary } from '../../api/client';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useFocusLoad } from '../../features/useFocusLoad';
import { colors, fonts, radius, shadow, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'NewConversation'>;

export function NewConversationScreen({ navigation }: Props) {
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchConnections().then(({ connections }) => connections)
  );
  const [startingId, setStartingId] = useState<string | null>(null);
  // Eskiden sohbet başlatma hatası yalnızca liste BOŞKEN görünüyordu, yani
  // kişiye dokunup hata alan kullanıcı hiçbir şey görmüyordu.
  const [startError, setStartError] = useState<string | null>(null);

  const handleStart = async (item: ConnectionSummary) => {
    setStartingId(item.user.id);
    setStartError(null);
    try {
      const { conversation } = await startConversation(item.user.id);
      navigation.replace('Chat', {
        conversationId: conversation.id,
        title: `${item.user.firstName} ${item.user.lastName}`,
      });
    } catch (err) {
      setStartError(friendlyMessage(err, 'Sohbet başlatılamadı'));
      setStartingId(null);
    }
  };

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <SkeletonList variant="row" />
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
        data={data ?? []}
        keyExtractor={(item) => item.connectionId}
        contentContainerStyle={styles.listContent}
        refreshControl={refreshControl(refreshing, refresh)}
        ListHeaderComponent={
          bannerMessage ? (
            <InlineError message={bannerMessage} onRetry={startError ? undefined : reload} style={styles.banner} />
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title="Önce bağlantı kurun"
            message="Mesaj göndermek için kişiyle bağlantıda olmanız gerekir. Profiline girip bağlantı isteği gönderebilirsiniz."
          />
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            disabled={startingId !== null}
            onPress={() => handleStart(item)}
          >
            <Text style={styles.name}>
              {item.user.firstName} {item.user.lastName}
            </Text>
            <Text style={styles.meta}>
              {startingId === item.user.id ? 'Açılıyor...' : item.user.position}
            </Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.lg },
  banner: { marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  name: { ...typography.subtitle, fontFamily: fonts.bold, color: colors.text },
  meta: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted, marginTop: 2 },
});
