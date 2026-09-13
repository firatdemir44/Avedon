import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useSession } from '../../context/SessionContext';
import {
  fetchIncomingSampleRequests,
  updateSampleRequestStatus,
  type SampleRequestWithDetails,
} from '../../api/client';
import { PrimaryButton } from '../../components/PrimaryButton';
import { STATUS_LABELS, nextStatus } from '../../features/sampleRequests/status';
import { colors, radius, spacing } from '../../theme';

export function IncomingSampleRequestsScreen() {
  const { user } = useSession();
  const [requests, setRequests] = useState<SampleRequestWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user?.companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchIncomingSampleRequests()
      .then(({ sampleRequests }) => setRequests(sampleRequests))
      .catch((err) => setError(err instanceof Error ? err.message : 'Talepler alınamadı'))
      .finally(() => setLoading(false));
  }, [user?.companyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleAdvance = async (request: SampleRequestWithDetails) => {
    const next = nextStatus(request.status);
    if (!next) return;
    setUpdatingId(request.id);
    try {
      await updateSampleRequestStatus(request.id, next);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Durum güncellenemedi');
    } finally {
      setUpdatingId(null);
    }
  };

  if (!user?.companyId) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Text style={styles.empty}>Bir firmaya bağlı değilsiniz.</Text>
      </SafeAreaView>
    );
  }

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
        ListEmptyComponent={<Text style={styles.empty}>{error ?? 'Henüz gelen numune talebi yok.'}</Text>}
        renderItem={({ item }) => {
          const next = nextStatus(item.status);
          return (
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.code}>{item.product.code}</Text>
                <Text style={styles.statusBadge}>{STATUS_LABELS[item.status]}</Text>
              </View>
              <Text style={styles.meta}>
                Talep eden: {item.requester.firstName} {item.requester.lastName}
              </Text>
              <Text style={styles.meta}>Teslimat tercihi: {item.deliveryPreference}</Text>
              {next ? (
                <PrimaryButton
                  label={updatingId === item.id ? 'Güncelleniyor...' : `${STATUS_LABELS[next]} olarak işaretle`}
                  disabled={updatingId === item.id}
                  onPress={() => handleAdvance(item)}
                  variant="secondary"
                  style={{ marginTop: spacing.sm }}
                />
              ) : null}
            </View>
          );
        }}
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
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  code: { fontSize: 16, fontWeight: '700', color: colors.text },
  statusBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  meta: { fontSize: 13, color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
});
