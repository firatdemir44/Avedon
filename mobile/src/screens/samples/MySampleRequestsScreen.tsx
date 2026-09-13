import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { RootStackScreenProps } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import { fetchMySampleRequests, type SampleRequestRow } from '../../api/client';
import { Badge } from '../../components/Badge';
import { formatRelativeTime } from '../../features/time';
import { colors, radius, shadow, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'MySampleRequests'>;

export function MySampleRequestsScreen({ navigation }: Props) {
  const { user } = useSession();
  const [requests, setRequests] = useState<SampleRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      setLoading(true);
      fetchMySampleRequests()
        .then(({ sampleRequests }) => {
          if (!cancelled) setRequests(sampleRequests);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Talepler alınamadı');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [user])
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
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.empty}>{error ?? 'Henüz numune talebiniz yok.'}</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() =>
              navigation.navigate('SampleRequestTracking', { sampleRequestId: item.id })
            }
          >
            <View style={styles.cardHeaderRow}>
              <Text style={styles.code}>{item.product.code}</Text>
              {/* Etiket sunucudan geliyor: son adımın adı teslimat moduna göre
                  değişiyor, istemcide ikinci bir eşleme tutulmuyor. */}
              <Badge label={item.statusLabel} />
            </View>
            <Text style={styles.meta}>{item.product.company.name}</Text>
            <Text style={styles.meta}>
              {item.deliveryModeLabel} · {formatRelativeTime(item.createdAt)}
            </Text>
            <Text style={styles.trackLink}>Takibi görüntüle →</Text>
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
  trackLink: { ...typography.label, color: colors.accent, marginTop: spacing.sm },
  empty: { ...typography.body, textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
});
