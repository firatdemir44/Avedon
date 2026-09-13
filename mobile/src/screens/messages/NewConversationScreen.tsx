import React, { useCallback, useState } from 'react';
import { Text, Pressable, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { fetchConnections, startConversation, type ConnectionSummary } from '../../api/client';
import { colors, radius, shadow, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'NewConversation'>;

export function NewConversationScreen({ navigation }: Props) {
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchConnections()
        .then(({ connections: fetched }) => setConnections(fetched))
        .catch((err) => setError(err instanceof Error ? err.message : 'Bağlantılar alınamadı'))
        .finally(() => setLoading(false));
    }, [])
  );

  const handleStart = async (item: ConnectionSummary) => {
    setStartingId(item.user.id);
    setError(null);
    try {
      const { conversation } = await startConversation(item.user.id);
      navigation.replace('Chat', {
        conversationId: conversation.id,
        title: `${item.user.firstName} ${item.user.lastName}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sohbet başlatılamadı');
      setStartingId(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <FlatList
        data={connections}
        keyExtractor={(item) => item.connectionId}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {error ?? 'Mesaj göndermek için önce bağlantı kurmalısınız.'}
          </Text>
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  name: { ...typography.subtitle, fontWeight: '700', color: colors.text },
  meta: { ...typography.label, fontWeight: '400', color: colors.textMuted, marginTop: 2 },
  empty: { ...typography.body, textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
});
