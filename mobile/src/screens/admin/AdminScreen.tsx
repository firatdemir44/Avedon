import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useSession } from '../../context/SessionContext';
import { fetchAdminCompanies, updateCompanyVerification, type CompanyWithCounts } from '../../api/client';
import { colors, radius, spacing } from '../../theme';
import type { VerificationStatus } from '../../types';

const STATUS_OPTIONS: { value: VerificationStatus; label: string }[] = [
  { value: 'dogrulanmamis', label: 'Doğrulanmamış' },
  { value: 'inceleniyor', label: 'İnceleniyor' },
  { value: 'dogrulanmis', label: 'Doğrulandı' },
];

export function AdminScreen() {
  const { user } = useSession();
  const [companies, setCompanies] = useState<CompanyWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user?.id) return;
    setLoading(true);
    fetchAdminCompanies(user.id)
      .then(({ companies: fetched }) => setCompanies(fetched))
      .catch((err) => setError(err instanceof Error ? err.message : 'Firmalar alınamadı'))
      .finally(() => setLoading(false));
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleSetStatus = async (companyId: string, status: VerificationStatus) => {
    if (!user?.id) return;
    setUpdatingId(companyId);
    try {
      await updateCompanyVerification(user.id, companyId, status);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Durum güncellenemedi');
    } finally {
      setUpdatingId(null);
    }
  };

  if (!user?.isAdmin) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Text style={styles.empty}>Bu ekrana erişim yetkiniz yok.</Text>
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
        data={companies}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.empty}>{error ?? 'Henüz firma yok.'}</Text>}
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
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeaderRow: { marginBottom: spacing.xs },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginBottom: 2 },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  statusChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  statusChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  statusChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  statusChipTextActive: {
    color: colors.primaryText,
  },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
});
