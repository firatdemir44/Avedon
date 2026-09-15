import React, { useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackScreenProps } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import {
  fetchIncomingSampleRequests,
  updateSampleRequestStatus,
  type SampleRequestRow,
} from '../../api/client';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Badge } from '../../components/Badge';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { formatRelativeTime } from '../../features/time';
import { useFocusLoad } from '../../features/useFocusLoad';
import { colors, fonts, radius, shadow, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'IncomingSampleRequests'>;

export function IncomingSampleRequestsScreen({ navigation }: Props) {
  const { user } = useSession();
  const hasCompany = !!user?.companyId;
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(
    () => fetchIncomingSampleRequests().then(({ sampleRequests }) => sampleRequests),
    { enabled: hasCompany }
  );
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleAdvance = async (request: SampleRequestRow) => {
    // Hangi adımın kime açık olduğuna sunucu karar veriyor; burada sadece
    // sunucunun verdiği bir sonraki adım uygulanıyor.
    if (!request.nextStep) return;
    setUpdatingId(request.id);
    setActionError(null);
    try {
      await updateSampleRequestStatus(request.id, request.nextStep.status);
      // Liste ekranda kalır, yeni durum sessizce gelir (eskiden tüm ekran
      // yükleniyor çemberine dönüyordu).
      await reload();
    } catch (err) {
      setActionError(friendlyMessage(err, 'Durum güncellenemedi'));
    } finally {
      setUpdatingId(null);
    }
  };

  if (!hasCompany) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <EmptyState
          icon="business-outline"
          title="Bir firmaya bağlı değilsiniz"
          message="Gelen numune talepleri firma hesaplarında görünür."
        />
      </SafeAreaView>
    );
  }

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

  const bannerMessage = actionError ?? (error ? friendlyMessage(error, 'Talepler alınamadı') : null);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={refreshControl(refreshing, refresh)}
        ListHeaderComponent={
          bannerMessage ? (
            <InlineError message={bannerMessage} onRetry={actionError ? undefined : reload} style={styles.banner} />
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="file-tray-outline"
            title="Henüz gelen talep yok"
            message="Ürünlerinize numune talebi geldiğinde burada görünür ve adımlarını buradan ilerletirsiniz."
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
  note: { ...typography.label, fontFamily: fonts.regular, color: colors.text, marginTop: spacing.xs },
  link: { color: colors.accent, fontFamily: fonts.semibold },
});
