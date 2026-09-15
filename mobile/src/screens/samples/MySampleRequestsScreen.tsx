import React from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackScreenProps } from '../../navigation/types';
import { fetchMySampleRequests } from '../../api/client';
import { Badge } from '../../components/Badge';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { formatRelativeTime } from '../../features/time';
import { useFocusLoad } from '../../features/useFocusLoad';
import { colors, fonts, radius, shadow, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'MySampleRequests'>;

export function MySampleRequestsScreen({ navigation }: Props) {
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchMySampleRequests().then(({ sampleRequests }) => sampleRequests)
  );

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <SkeletonList variant="request" />
      </SafeAreaView>
    );
  }

  if (status === 'error') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ErrorState error={error} fallback="Talepler alınamadı" onRetry={reload} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={refreshControl(refreshing, refresh)}
        ListHeaderComponent={
          error ? (
            <InlineError message={friendlyMessage(error, 'Talepler alınamadı')} onRetry={reload} style={styles.banner} />
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="flask-outline"
            title="Henüz numune talebiniz yok"
            message="Beğendiğiniz ürünün sayfasından numune isteyebilir, süreci buradan adım adım takip edebilirsiniz."
            actionLabel="Ürünlere göz at"
            onAction={() => navigation.navigate('MainTabs', { screen: 'ProductList' })}
          />
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
  banner: { marginBottom: spacing.md },
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
  code: { ...typography.subtitle, fontFamily: fonts.bold, color: colors.primary },
  meta: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  trackLink: { ...typography.label, color: colors.accent, marginTop: spacing.sm },
});
