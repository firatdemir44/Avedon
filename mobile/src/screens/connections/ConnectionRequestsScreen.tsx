import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { PrimaryButton } from '../../components/PrimaryButton';
import {
  fetchIncomingConnectionRequests,
  respondToConnectionRequest,
  type IncomingConnectionRequest,
} from '../../api/client';
import { colors, radius, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ConnectionRequests'>;

export function ConnectionRequestsScreen({ navigation }: Props) {
  const [requests, setRequests] = useState<IncomingConnectionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchIncomingConnectionRequests()
      .then(({ requests: fetched }) => setRequests(fetched))
      .catch((err) => setError(err instanceof Error ? err.message : 'İstekler alınamadı'))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleRespond = async (id: string, status: 'accepted' | 'rejected') => {
    setUpdatingId(id);
    try {
      await respondToConnectionRequest(id, status);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem yapılamadı');
    } finally {
      setUpdatingId(null);
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
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.empty}>{error ?? 'Bekleyen bağlantı isteğiniz yok.'}</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable onPress={() => navigation.navigate('Profile', { userId: item.requester.id })}>
              <Text style={styles.name}>
                {item.requester.firstName} {item.requester.lastName}
              </Text>
              <Text style={styles.meta}>{item.requester.position}</Text>
            </Pressable>
            <View style={styles.actionRow}>
              <PrimaryButton
                label={updatingId === item.id ? 'İşleniyor...' : 'Kabul Et'}
                disabled={updatingId === item.id}
                onPress={() => handleRespond(item.id, 'accepted')}
                style={styles.actionButton}
              />
              <PrimaryButton
                label="Reddet"
                variant="secondary"
                disabled={updatingId === item.id}
                onPress={() => handleRespond(item.id, 'rejected')}
                style={styles.actionButton}
              />
            </View>
          </View>
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
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionButton: { flex: 1 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
});
