import React, { useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { ListRow } from '../../components/ListRow';
import { ProductRow } from '../../components/ProductRow';
import { SectionHeader } from '../../components/SectionHeader';
import { colors, fonts, radius, spacing, typography } from '../../theme';
import type { VerificationStatus } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'CompanyProfile'>;

// Taslak: docs/tasarim-yonleri/CFirma.dc.html. Kimlik bloğu, "Çalışanlar" ve
// "Ürünler" bölümleri çizgili satırlarla; kendi firmanda eylemler kimlik bloğunda.
export function CompanyProfileScreen({ navigation, route }: Props) {
  const { user } = useSession();
  const viewedCompanyId = route.params?.companyId ?? user?.companyId ?? null;
  const isOwnCompany = !!user?.companyId && viewedCompanyId === user.companyId;
  // Ürün ekleyip / firmayı düzenleyip geri dönünce sayfa iskelete dönmüyor,
  // güncel bilgi sessizce geliyor.
  const { data: company, status, error, refreshing, reload, refresh } = useFocusLoad(
    () => fetchCompany(viewedCompanyId as string).then(({ company: fetched }) => fetched),
    { enabled: !!viewedCompanyId }
  );

  // Başlık sabit "Firmam" iken başka bir firmanın sayfasında da "Firmam"
  // yazıyordu (denetim FINDING-018).
  useEffect(() => {
    navigation.setOptions({ title: isOwnCompany ? 'Firmam' : company?.name ?? 'Firma' });
  }, [navigation, isOwnCompany, company?.name]);

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

  const employees = company.users.filter((u) => u.id !== user?.id);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <FlatList
        data={company.products}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={refreshControl(refreshing, refresh)}
        ListHeaderComponent={
          <View>
            {error ? (
              <InlineError
                message={friendlyMessage(error, 'Firma bilgisi alınamadı')}
                onRetry={reload}
                style={styles.banner}
              />
            ) : null}

            <View style={styles.identityBlock}>
              <View style={styles.identityRow}>
                <CompanyAvatar name={company.name} size={56} companyId={company.id} logoUpdatedAt={company.logoUpdatedAt} />
                <View style={styles.identityTexts}>
                  <Text style={styles.name}>{company.name}</Text>
                  <View style={styles.tagRow}>
                    <VerificationTag status={company.verification} />
                    <Text style={styles.taxId}>VKN {company.taxId}</Text>
                  </View>
                </View>
              </View>

              {company.about ? <Text style={styles.about}>{company.about}</Text> : null}
              {company.contactEmail || company.contactPhone || isOwnCompany ? (
                <View style={styles.facts}>
                  {company.contactEmail ? <Fact label="E-posta" value={company.contactEmail} /> : null}
                  {company.contactPhone ? <Fact label="Telefon" value={company.contactPhone} mono /> : null}
                  {isOwnCompany ? <Fact label="Şirket kodu" value={company.companyCode} mono /> : null}
                </View>
              ) : null}

              {isOwnCompany ? (
                <View style={styles.actions}>
                  <View style={styles.actionRow}>
                    <PrimaryButton
                      label="Ürün Ekle"
                      icon="add"
                      onPress={() => navigation.navigate('AddProduct')}
                      style={styles.actionButton}
                    />
                    <PrimaryButton
                      label="Gelen Talepler"
                      variant="outline"
                      onPress={() => navigation.navigate('IncomingSampleRequests')}
                      style={styles.actionButton}
                    />
                  </View>
                  <PrimaryButton
                    label="Firmayı Düzenle"
                    variant="outline"
                    icon="create-outline"
                    onPress={() => navigation.navigate('EditCompany', { companyId: company.id })}
                  />
                </View>
              ) : null}
            </View>

            {employees.length > 0 ? (
              <>
                <SectionHeader title="Çalışanlar" />
                <View style={styles.block}>
                  {employees.map((employee, index) => (
                    <ListRow
                      key={employee.id}
                      title={`${employee.firstName} ${employee.lastName}`}
                      subtitle={employee.position}
                      minHeight={60}
                      divider={index < employees.length - 1}
                      onPress={() => navigation.navigate('Profile', { userId: employee.id })}
                    />
                  ))}
                </View>
              </>
            ) : null}

            <SectionHeader title="Ürünler" count={company.products.length} />
          </View>
        }
        ListEmptyComponent={
          <View style={styles.block}>
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
          </View>
        }
        renderItem={({ item, index }) => (
          <ProductRow
            product={item}
            showCompany={false}
            divider={index < company.products.length - 1}
            // Herkes için ürün sayfası açılıyor; düzenleme oradaki düğmede.
            onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
            onRequestSample={
              !isOwnCompany && user
                ? () => navigation.navigate('SampleRequestForm', { productId: item.id, productCode: item.code })
                : undefined
            }
          />
        )}
      />
    </SafeAreaView>
  );
}

function VerificationTag({ status }: { status: VerificationStatus }) {
  if (status === 'dogrulanmis') {
    return (
      <View style={[styles.tag, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name="checkmark" size={13} color={colors.primary} />
        <Text style={[styles.tagText, { color: colors.primary }]}>Doğrulanmış</Text>
      </View>
    );
  }
  if (status === 'inceleniyor') {
    return (
      <View style={[styles.tag, { backgroundColor: colors.warningSoft }]}>
        <Ionicons name="time-outline" size={13} color={colors.warning} />
        <Text style={[styles.tagText, { color: colors.warning }]}>İnceleniyor</Text>
      </View>
    );
  }
  return (
    <View style={[styles.tag, styles.tagOutline]}>
      <Text style={[styles.tagText, { color: colors.textMuted }]}>Doğrulanmamış</Text>
    </View>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={[styles.factValue, mono && styles.factValueMono]} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingBottom: spacing.xl },
  banner: { margin: spacing.gutter, marginBottom: 0 },
  block: { backgroundColor: colors.surface },
  identityBlock: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.gutter },
  identityTexts: { flex: 1, gap: spacing.xs },
  name: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26, color: colors.text },
  tagRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  tagOutline: { borderWidth: 1, borderColor: colors.border },
  tagText: { ...typography.caption, fontFamily: fonts.semibold },
  taxId: { ...typography.mono, fontSize: 12, lineHeight: 16, color: colors.textMuted },
  about: { ...typography.body, color: colors.text, marginTop: 12 },
  facts: { marginTop: spacing.sm },
  fact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 40,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  factLabel: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  factValue: { ...typography.body, color: colors.text, flexShrink: 1, textAlign: 'right' },
  factValueMono: { fontFamily: fonts.mono },
  actions: { marginTop: 12, gap: spacing.sm },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1, paddingHorizontal: spacing.sm },
});
