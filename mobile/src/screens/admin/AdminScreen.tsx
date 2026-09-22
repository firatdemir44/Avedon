import React, { useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../../context/SessionContext';
import { fetchAdminCompanies, updateCompanyVerification } from '../../api/client';
import { AdminVerificationRequests } from './AdminVerificationRequests';
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

// Doğrulamanın nasıl yapıldığı (Faz 2, Adım 7): firma sayfasındaki rozet
// açıklamasında görünür.
type VerificationLevel = 'belge' | 'ziyaret';

const LEVEL_OPTIONS: { value: VerificationLevel; label: string }[] = [
  { value: 'belge', label: 'Belge ile' },
  { value: 'ziyaret', label: 'Yerinde ziyaretle' },
];

function levelLabel(level?: string): string {
  return LEVEL_OPTIONS.find((o) => o.value === level)?.label ?? 'Düzey belirtilmemiş';
}

/**
 * Yönetici ekranı ("Firma Doğrulama"). İki sekme: gelen doğrulama başvuruları
 * (karar verilen yer) ve firma listesinde elle durum değiştirme (eskiden beri
 * duran yol, kaldırılmadı). Ekran yalnızca `user.isAdmin` olanlara açılır;
 * yöneticinin kim olduğu firmaya hiçbir yerde gösterilmez.
 */
export function AdminScreen() {
  const { user } = useSession();
  const isAdmin = !!user?.isAdmin;
  const [tab, setTab] = useState<'requests' | 'companies'>('requests');
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <EmptyState
          icon="lock-closed-outline"
          title="Erişim yetkiniz yok"
          message="Bu ekran yalnızca Avedon ekibine açık."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={styles.tabStrip}>
        <Pressable
          style={[styles.tab, tab === 'requests' && styles.tabActive]}
          onPress={() => setTab('requests')}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'requests' }}
        >
          <Text style={[styles.tabText, tab === 'requests' && styles.tabTextActive]} numberOfLines={1}>
            {pendingCount === null ? 'Başvurular' : `Başvurular (${pendingCount})`}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'companies' && styles.tabActive]}
          onPress={() => setTab('companies')}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'companies' }}
        >
          <Text style={[styles.tabText, tab === 'companies' && styles.tabTextActive]} numberOfLines={1}>
            Firmalar
          </Text>
        </Pressable>
      </View>
      {tab === 'requests' ? (
        <AdminVerificationRequests onPendingCount={setPendingCount} />
      ) : (
        <AdminCompanies />
      )}
    </SafeAreaView>
  );
}

// Firma listesi + elle durum değiştirme (eski ekranın aynısı).
function AdminCompanies() {
  const { user } = useSession();
  const isAdmin = !!user?.isAdmin;
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(
    () => fetchAdminCompanies().then(({ companies }) => companies),
    { enabled: isAdmin }
  );
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleSetStatus = async (
    companyId: string,
    nextStatus: VerificationStatus,
    level?: VerificationLevel
  ) => {
    if (!isAdmin) return;
    setUpdatingId(companyId);
    setActionError(null);
    try {
      // "Doğrulandı" düzeysiz gönderilmez: varsayılan "Belge ile".
      await updateCompanyVerification(
        companyId,
        nextStatus,
        nextStatus === 'dogrulanmis' ? (level ?? 'belge') : undefined
      );
      await reload();
    } catch (err) {
      setActionError(friendlyMessage(err, 'Durum güncellenemedi'));
    } finally {
      setUpdatingId(null);
    }
  };

  if (status === 'loading') {
    return (
      <View style={styles.safeArea}>
        <SkeletonList variant="request" />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.safeArea}>
        <ErrorState error={error} fallback="Firmalar alınamadı" onRetry={reload} />
      </View>
    );
  }

  const bannerMessage = actionError ?? (error ? friendlyMessage(error, 'Firmalar alınamadı') : null);

  return (
    <View style={styles.safeArea}>
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
            {item.verification === 'dogrulanmis' ? (
              <View style={styles.levelBlock}>
                <Text style={styles.levelHint}>Doğrulama düzeyi: {levelLabel(item.verificationLevel)}</Text>
                <View style={styles.statusRow}>
                  {LEVEL_OPTIONS.map((option) => {
                    const isCurrent = item.verificationLevel === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        disabled={isCurrent || updatingId === item.id}
                        onPress={() => handleSetStatus(item.id, 'dogrulanmis', option.value)}
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
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  // Sekme şeridi: iki eşit düğme, seçili olan lacivert dolu (Ürünler/Akış
  // ekranındaki görünüm seçimi kalıbı).
  tabStrip: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { ...typography.label, fontFamily: fonts.semibold, color: colors.text },
  tabTextActive: { color: colors.primaryText },
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
  levelBlock: { marginTop: spacing.sm },
  levelHint: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
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
