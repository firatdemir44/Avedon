import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { RootStackScreenProps } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import {
  fetchIncomingSampleRequests,
  updateSampleRequestStatus,
  type SampleRequestRow,
} from '../../api/client';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Badge } from '../../components/Badge';
import { formatRelativeTime } from '../../features/time';
import { colors, radius, shadow, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'IncomingSampleRequests'>;

export function IncomingSampleRequestsScreen({ navigation }: Props) {
  const { user } = useSession();
  const [requests, setRequests] = useState<SampleRequestRow[]>([]);
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

  const handleAdvance = async (request: SampleRequestRow) => {
    // Hangi adımın kime açık olduğuna sunucu karar veriyor; burada sadece
    // sunucunun verdiği bir sonraki adım uygulanıyor.
    if (!request.nextStep) return;
    setUpdatingId(request.id);
    try {
      await updateSampleRequestStatus(request.id, request.nextStep.status);
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
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() =>
              navigation.navigate('SampleRequestTracking', { sampleRequestId: item.id })
            }
          >
            <View style={styles.cardHeaderRow}>
              <Text style={styles.code}>{item.product.code}</Text>
              <Badge label={item.statusLabel} />
            </View>
            <Pressable onPress={() => navigation.navigate('Profile', { userId: item.requester.id })}>
              <Text style={styles.meta}>
                Talep eden:{' '}
                <Text style={styles.link}>
                  {item.requester.firstName} {item.requester.lastName}
                </Text>
              </Text>
            </Pressable>
            <Text style={styles.meta}>
              {item.deliveryModeLabel} · {formatRelativeTime(item.createdAt)}
            </Text>
            {item.note ? <Text style={styles.note}>“{item.note}”</Text> : null}
            {item.nextStep ? (
              <PrimaryButton
                label={
                  updatingId === item.id
                    ? 'Güncelleniyor...'
                    : `${item.nextStep.label} olarak işaretle`
                }
                disabled={updatingId === item.id}
                onPress={() => handleAdvance(item)}
                variant="secondary"
                style={{ marginTop: spacing.sm }}
              />
            ) : null}
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
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  code: { ...typography.subtitle, fontWeight: '700', color: colors.primary },
  meta: { ...typography.label, fontWeight: '400', color: colors.textMuted },
  note: { ...typography.label, fontWeight: '400', color: colors.text, marginTop: spacing.xs },
  link: { color: colors.accent, fontWeight: '600' },
  empty: { ...typography.body, textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
});
