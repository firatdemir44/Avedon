import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { fetchConnections, type ConnectionSummary } from '../../api/client';
import { colors, radius, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Connections'>;

export function ConnectionsListScreen({ navigation }: Props) {
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
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
        ListEmptyComponent={<Text style={styles.empty}>{error ?? 'Henüz bağlantınız yok.'}</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => navigation.navigate('Profile', { userId: item.user.id })}>
            <Text style={styles.name}>
              {item.user.firstName} {item.user.lastName}
            </Text>
            <Text style={styles.meta}>{item.user.position}</Text>
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
});
