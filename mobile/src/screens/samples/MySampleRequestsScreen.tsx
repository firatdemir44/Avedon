import React from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import { fetchMySampleRequests } from '../../api/client';
import { SampleStatusBadge } from '../../components/SampleStatusBadge';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { formatRelativeTime } from '../../features/time';
import { useFocusLoad } from '../../features/useFocusLoad';
import { colors, fonts, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'MySampleRequests'>;

// Yeni düzen (5. aşama): çizgili talep satırları; dokununca takip ekranı.
// Eskiden kart içinde "Takibi görüntüle →" metni vardı; satırın kendisi
// dokunulabilir ve sonunda ok ikonu var.
export function MySampleRequestsScreen({ navigation }: Props) {
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchMySampleRequests().then(({ sampleRequests }) => sampleRequests)
  );
  const requests = data ?? [];

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
        data={requests}
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
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => navigation.navigate('SampleRequestTracking', { sampleRequestId: item.id })}
            accessibilityRole="button"
            accessibilityLabel={`${item.product.code}, ${item.product.company.name}, ${item.statusLabel}. Takibi aç`}
            android_ripple={{ color: colors.pressed }}
            style={({ pressed }) => [styles.row, index < requests.length - 1 && styles.rowDivider, pressed && styles.pressed]}
          >
            <View style={styles.texts}>
              <View style={styles.topLine}>
                <Text style={styles.code}>{item.product.code}</Text>
                <SampleStatusBadge status={item.status} label={item.statusLabel} />
              </View>
              <Text style={styles.company} numberOfLines={1}>
                {item.product.company.name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {item.deliveryModeLabel} · {formatRelativeTime(item.createdAt)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.chevron} />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingTop: spacing.blockGap, paddingBottom: spacing.xl },
  banner: { marginHorizontal: spacing.gutter, marginBottom: spacing.blockGap },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.gutter,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  pressed: { backgroundColor: colors.pressed },
  texts: { flex: 1, gap: 2 },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  code: { ...typography.monoStrong, color: colors.primary },
  company: { ...typography.label, color: colors.accent },
  meta: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
});
