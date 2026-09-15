import React, { useState } from 'react';
import { View, Text, Pressable, FlatList, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackScreenProps } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import {
  fetchIncomingSampleRequests,
  updateSampleRequestStatus,
  type SampleRequestRow,
} from '../../api/client';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SampleStatusBadge } from '../../components/SampleStatusBadge';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { formatRelativeTime } from '../../features/time';
import { useFocusLoad } from '../../features/useFocusLoad';
import { haptics } from '../../features/haptics';
import { colors, fonts, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'IncomingSampleRequests'>;

// Yeni düzen (5. aşama): çizgili talep satırları. Satıra dokununca takip
// ekranı; satır içinde talep edenin profili ve bir sonraki adım düğmesi.
export function IncomingSampleRequestsScreen({ navigation }: Props) {
  const { user } = useSession();
  const hasCompany = !!user?.companyId;
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(
    () => fetchIncomingSampleRequests().then(({ sampleRequests }) => sampleRequests),
    { enabled: hasCompany }
  );
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const requests = data ?? [];

  const handleAdvance = async (request: SampleRequestRow) => {
    // Hangi adımın kime açık olduğuna sunucu karar veriyor; nextStep yalnızca
    // bu kullanıcı ilerletebiliyorsa geliyor.
    if (!request.nextStep) return;
    setUpdatingId(request.id);
    setActionError(null);
    try {
      await updateSampleRequestStatus(request.id, request.nextStep.status);
      haptics.success();
      // Liste ekranda kalır, yeni durum sessizce gelir.
      await reload();
    } catch (err) {
      haptics.error();
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
        data={requests}
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
        renderItem={({ item, index }) => {
          const requesterName = `${item.requester.firstName} ${item.requester.lastName}`;
          return (
            <Pressable
              onPress={() => navigation.navigate('SampleRequestTracking', { sampleRequestId: item.id })}
              // Satırın içinde düğmeler var: web'de rol verilirse iç içe
              // <button> oluşur (bkz. ProductRow).
              accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
              accessibilityLabel={`${item.product.code}, ${requesterName}, ${item.statusLabel}. Takibi aç`}
              android_ripple={{ color: colors.pressed }}
              style={({ pressed }) => [styles.row, index < requests.length - 1 && styles.rowDivider, pressed && styles.pressed]}
            >
              <View style={styles.topLine}>
                <Text style={styles.code}>{item.product.code}</Text>
                <SampleStatusBadge status={item.status} label={item.statusLabel} />
              </View>
              <View style={styles.requesterLine}>
                <Text style={styles.meta}>Talep eden: </Text>
                <Pressable
                  onPress={() => navigation.navigate('Profile', { userId: item.requester.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`${requesterName}, profili aç`}
                  hitSlop={8}
                  style={({ pressed }) => pressed && styles.pressedFade}
                >
                  <Text style={styles.requesterName}>{requesterName}</Text>
                </Pressable>
              </View>
              <Text style={styles.meta} numberOfLines={1}>
                {item.deliveryModeLabel} · {formatRelativeTime(item.createdAt)}
              </Text>
              {item.note ? <Text style={styles.note}>“{item.note}”</Text> : null}
              {item.nextStep ? (
                <PrimaryButton
                  label={updatingId === item.id ? 'Güncelleniyor' : `${item.nextStep.label} olarak işaretle`}
                  variant="outline"
                  disabled={updatingId === item.id}
                  onPress={() => handleAdvance(item)}
                  style={styles.advanceButton}
                />
              ) : null}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingTop: spacing.blockGap, paddingBottom: spacing.xl },
  banner: { marginHorizontal: spacing.gutter, marginBottom: spacing.blockGap },
  row: {
    paddingHorizontal: spacing.gutter,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    gap: 2,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  pressed: { backgroundColor: colors.pressed },
  pressedFade: { opacity: 0.6 },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  code: { ...typography.monoStrong, color: colors.primary },
  requesterLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  requesterName: { ...typography.label, color: colors.accent },
  meta: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  note: { ...typography.label, fontFamily: fonts.regular, color: colors.text, marginTop: 2 },
  advanceButton: { marginTop: spacing.sm },
});
