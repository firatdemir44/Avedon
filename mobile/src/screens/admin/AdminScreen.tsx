import React, { useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../../context/SessionContext';
import { fetchAdminCompanies, updateCompanyVerification } from '../../api/client';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useFocusLoad } from '../../features/useFocusLoad';
import { colors, fonts, radius, shadow, spacing, typography } from '../../theme';
import type { VerificationStatus } from '../../types';

const STATUS_OPTIONS: { value: VerificationStatus; label: string }[] = [
  { value: 'dogrulanmamis', label: 'Doğrulanmamış' },
  { value: 'inceleniyor', label: 'İnceleniyor' },
  { value: 'dogrulanmis', label: 'Doğrulandı' },
];

export function AdminScreen() {
  const { user } = useSession();
  const isAdmin = !!user?.isAdmin;
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(
    () => fetchAdminCompanies().then(({ companies }) => companies),
    { enabled: isAdmin }
  );
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleSetStatus = async (companyId: string, nextStatus: VerificationStatus) => {
    if (!isAdmin) return;
    setUpdatingId(companyId);
    setActionError(null);
    try {
      await updateCompanyVerification(companyId, nextStatus);
      await reload();
    } catch (err) {
      setActionError(friendlyMessage(err, 'Durum güncellenemedi'));
    } finally {
      setUpdatingId(null);
    }
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <EmptyState
          icon="lock-closed-outline"
          title="Erişim yetkiniz yok"
          message="Bu ekran yalnızca Avedon yöneticilerine açık."
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
        <ErrorState error={error} fallback="Firmalar alınamadı" onRetry={reload} />
      </SafeAreaView>
    );
  }

  const bannerMessage = actionError ?? (error ? friendlyMessage(error, 'Firmalar alınamadı') : null);

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
        ListEmptyComponent={<EmptyState icon="business-outline" title="Henüz firma yok" />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.name}>{item.name}</Text>
            </View>
            <Text style={styles.meta}>Vergi No: {item.taxId}</Text>
            <Text style={styles.meta}>Şirket Kodu: {item.companyCode}</Text>
            <Text style={styles.meta}>
              {item._count.users} çalışan · {item._count.products} ürün
            </Text>
            <View style={styles.statusRow}>
              {STATUS_OPTIONS.map((option) => {
                const isCurrent = item.verification === option.value;
                return (
                  <Pressable
                    key={option.value}
                    disabled={isCurrent || updatingId === item.id}
                    onPress={() => handleSetStatus(item.id, option.value)}
                    style={[styles.statusChip, isCurrent && styles.statusChipActive]}
                  >
                    <Text style={[styles.statusChipText, isCurrent && styles.statusChipTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
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
  banner: { marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  cardHeaderRow: { marginBottom: spacing.xs },
  name: { ...typography.subtitle, fontFamily: fonts.bold, color: colors.text },
  meta: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted, marginBottom: 2 },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  statusChip: {
    minHeight: 40,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceTonal,
  },
  statusChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  statusChipText: {
    ...typography.label,
    color: colors.text,
  },
  statusChipTextActive: {
    color: colors.primaryText,
  },
});
