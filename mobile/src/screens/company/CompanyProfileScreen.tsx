import React, { useEffect } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { fetchCompany } from '../../api/client';
import { useFocusLoad } from '../../features/useFocusLoad';
import { SkeletonDetail } from '../../components/Skeleton';
import {
  EmptyState,
  ErrorState,
  InlineError,
  friendlyMessage,
  isNotFound,
} from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useSession } from '../../context/SessionContext';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProductThumbnail } from '../../components/ProductThumbnail';
import { Badge } from '../../components/Badge';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { formatMeasure } from '../../features/calculators/parse';
import { MIN_TOUCH, colors, fonts, radius, shadow, spacing, typography } from '../../theme';
import type { Product, VerificationStatus } from '../../types';

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
  // Ürün ekleyip / firmayı düzenleyip geri dönünce sayfa iskelete dönmüyor,
  // güncel bilgi sessizce geliyor (eskiden her dönüşte tüm sayfa yeniden yükleniyordu).
  const { data: company, status, error, refreshing, reload, refresh } = useFocusLoad(
    () => fetchCompany(viewedCompanyId as string).then(({ company: fetched }) => fetched),
    { enabled: !!viewedCompanyId }
  );

  // Başlık sabit "Firmam" iken başka bir firmanın sayfasında da "Firmam"
  // yazıyordu (denetim FINDING-018).
  useEffect(() => {
    navigation.setOptions({ title: isOwnCompany ? 'Firmam' : company?.name ?? 'Firma' });
  }, [navigation, isOwnCompany, company?.name]);

  // Not: bu ekran başlıklı bir yığın ekranı; üst güvenli alanı başlık zaten
  // karşılıyor. Eskiden 'top' da verildiği için başlığın altında fazladan boşluk vardı.
  if (!viewedCompanyId) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <EmptyState
          icon="business-outline"
          title="Firmaya bağlı değilsiniz"
          message="Bireysel hesabınız bir firmaya bağlı değil."
        />
      </SafeAreaView>
    );
  }

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <SkeletonDetail variant="company" />
      </SafeAreaView>
    );
  }

  if (!company) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {error && !isNotFound(error) ? (
          <ErrorState error={error} fallback="Firma bilgisi alınamadı" onRetry={reload} />
        ) : (
          <EmptyState icon="business-outline" title="Firma bulunamadı" message="Firma kaldırılmış olabilir." />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <FlatList
        data={company.products}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={refreshControl(refreshing, refresh)}
        ListHeaderComponent={
          <View style={styles.header}>
            {error ? (
              <InlineError
                message={friendlyMessage(error, 'Firma bilgisi alınamadı')}
                onRetry={reload}
                style={styles.banner}
              />
            ) : null}
            <View style={styles.headerTopRow}>
              <View style={styles.identity}>
                <CompanyAvatar
                  name={company.name}
                  verification={company.verification}
                  size={56}
                  companyId={company.id}
                  logoUpdatedAt={company.logoUpdatedAt}
                />
                <Text style={styles.name}>{company.name}</Text>
              </View>
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
            {company.about ? <Text style={styles.about}>{company.about}</Text> : null}
            {company.contactEmail ? <Text style={styles.meta}>E-posta: {company.contactEmail}</Text> : null}
            {company.contactPhone ? <Text style={styles.meta}>Telefon: {company.contactPhone}</Text> : null}
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
            {isOwnCompany ? (
              <PrimaryButton
                label="Firmayı Düzenle"
                variant="secondary"
                onPress={() => navigation.navigate('EditCompany', { companyId: company.id })}
                style={{ marginTop: spacing.sm }}
              />
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
        ListEmptyComponent={
          <EmptyState
            compact
            icon="cube-outline"
            title="Henüz ürün eklenmemiş"
            message={
              isOwnCompany
                ? 'Ürün eklediğinizde katalogda ve firma sayfanızda görünür.'
                : 'Bu firma henüz ürün eklemedi.'
            }
            actionLabel={isOwnCompany ? 'Ürün Ekle' : undefined}
            onAction={isOwnCompany ? () => navigation.navigate('AddProduct') : undefined}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            // Herkes için ürün sayfası açılıyor; düzenleme oradaki düğmede.
            // Eskiden kendi firman değilse karta dokunmak hiçbir şey yapmıyordu.
            onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
          >
            <ProductThumbnail productId={item.id} hasImage={item.hasImage} />
            <View style={styles.cardBody}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.code}>{item.code}</Text>
                <Badge label={TYPE_LABELS[item.type]} tone="outline" />
              </View>
              <Text style={styles.content}>{item.content}</Text>
              <Text style={styles.meta}>
                {formatMeasure(item.weightGsm)} gr/m² · {formatMeasure(item.widthCm)} cm en ·{' '}
                {formatMeasure(item.stock)} m stok
              </Text>
              {isOwnCompany ? <Text style={styles.editHint}>Detay için dokunun</Text> : null}
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
  listContent: {
    padding: spacing.lg,
  },
  banner: {
    marginBottom: spacing.md,
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
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexShrink: 1,
  },
  name: {
    ...typography.title,
    fontSize: 24,
    lineHeight: 30,
    color: colors.primary,
    flexShrink: 1,
  },
  about: {
    ...typography.body,
    color: colors.text,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  verificationBadge: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    color: colors.textMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  verificationBadgeVerified: {
    color: colors.primary,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
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
    ...typography.label,
    fontFamily: fonts.regular,
    color: colors.textMuted,
    marginBottom: 2,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.primary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  employeeRow: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  employeeName: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
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
    ...typography.subtitle,
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  content: {
    ...typography.body,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  sampleButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    minHeight: MIN_TOUCH - 8,
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm,
  },
  sampleButtonText: {
    ...typography.label,
    color: colors.primaryText,
  },
  editHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
});
