import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { fetchCompany, type CompanyEmployee } from '../../api/client';
import { useSession } from '../../context/SessionContext';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProductThumbnail } from '../../components/ProductThumbnail';
import { colors, radius, spacing } from '../../theme';
import type { Company, Product, VerificationStatus } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'CompanyProfile'>;

const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  dogrulanmamis: 'Doğrulanmamış',
  inceleniyor: 'İnceleniyor',
  dogrulanmis: 'Doğrulanmış',
};

const TYPE_LABELS: Record<Product['type'], string> = {
  raschel: 'Raschel',
  orme: 'Örme',
  dokuma: 'Dokuma',
  diger: 'Diğer',
};

export function CompanyProfileScreen({ navigation, route }: Props) {
  const { user } = useSession();
  const viewedCompanyId = route.params?.companyId ?? user?.companyId ?? null;
  const isOwnCompany = !!user?.companyId && viewedCompanyId === user.companyId;
  const [company, setCompany] = useState<(Company & { products: Product[]; users: CompanyEmployee[] }) | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!viewedCompanyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchCompany(viewedCompanyId)
      .then(({ company: fetched }) => setCompany(fetched))
      .catch((err) => setError(err instanceof Error ? err.message : 'Firma bilgisi alınamadı'))
      .finally(() => setLoading(false));
  }, [viewedCompanyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!viewedCompanyId) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Bireysel hesabınız bir firmaya bağlı değil.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (error || !company) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{error ?? 'Firma bulunamadı'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <FlatList
        data={company.products}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <Text style={styles.name}>{company.name}</Text>
              <Text
                style={[
                  styles.verificationBadge,
                  company.verification === 'dogrulanmis' && styles.verificationBadgeVerified,
                ]}
              >
                {VERIFICATION_LABELS[company.verification] ?? company.verification}
              </Text>
            </View>
            <Text style={styles.meta}>Vergi No: {company.taxId}</Text>
            {isOwnCompany ? <Text style={styles.meta}>Şirket Kodu: {company.companyCode}</Text> : null}
            {isOwnCompany ? (
              <View style={styles.actionRow}>
                <PrimaryButton label="Ürün Ekle" onPress={() => navigation.navigate('AddProduct')} style={styles.actionButton} />
                <PrimaryButton
                  label="Gelen Talepler"
                  variant="secondary"
                  onPress={() => navigation.navigate('IncomingSampleRequests')}
                  style={styles.actionButton}
                />
              </View>
            ) : null}
            {company.users.filter((u) => u.id !== user?.id).length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>Çalışanlar</Text>
                {company.users
                  .filter((u) => u.id !== user?.id)
                  .map((employee) => (
                    <Pressable
                      key={employee.id}
                      style={styles.employeeRow}
                      onPress={() => navigation.navigate('Profile', { userId: employee.id })}
                    >
                      <Text style={styles.employeeName}>
                        {employee.firstName} {employee.lastName}
                      </Text>
                      <Text style={styles.meta}>{employee.position}</Text>
                    </Pressable>
                  ))}
              </>
            ) : null}
            <Text style={styles.sectionTitle}>Ürünler ({company.products.length})</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>Henüz ürün eklenmemiş.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            disabled={!isOwnCompany}
            onPress={() => navigation.navigate('AddProduct', { productId: item.id })}
          >
            <ProductThumbnail imageUrl={item.imageUrl} />
            <View style={styles.cardBody}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.code}>{item.code}</Text>
                <Text style={styles.typeBadge}>{TYPE_LABELS[item.type]}</Text>
              </View>
              <Text style={styles.content}>{item.content}</Text>
              <Text style={styles.meta}>
                {item.weightGsm} gr/m² · {item.widthCm} cm en · {item.stock} m stok
              </Text>
              {isOwnCompany ? <Text style={styles.editHint}>Düzenlemek için dokunun</Text> : null}
              {!isOwnCompany && user ? (
                <Pressable
                  style={styles.sampleButton}
                  onPress={() => navigation.navigate('SampleRequestForm', { productId: item.id, productCode: item.code })}
                >
                  <Text style={styles.sampleButtonText}>Numune Talep Et</Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  listContent: {
    padding: spacing.lg,
  },
  header: {
    marginBottom: spacing.md,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    flexShrink: 1,
  },
  verificationBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  verificationBadgeVerified: {
    color: colors.primary,
    borderColor: colors.primary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionButton: {
    flex: 1,
  },
  meta: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.lg,
  },
  employeeRow: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  employeeName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  code: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  typeBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  content: {
    fontSize: 14,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
  sampleButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  sampleButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  editHint: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
});
