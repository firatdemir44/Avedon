import React, { useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import { fetchDeals, type DealView } from '../../api/client';
import { DealStatusBadge } from '../../components/DealStatusBadge';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { formatQuantity, formatQuoteDate } from '../../features/quotes/format';
import { useFocusLoad } from '../../features/useFocusLoad';
import { haptics } from '../../features/haptics';
import { colors, fonts, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'Deals'>;

type Role = 'buyer' | 'seller';

// Faz 3, Adım 4. İki liste tek yüklemede geliyor (teklif listesindeki desen):
// sekme değişince istek atılmıyor.
export function DealsScreen({ route, navigation }: Props) {
  const { user } = useSession();
  const hasCompany = !!user?.companyId;
  const [role, setRole] = useState<Role>(route.params?.role === 'seller' && hasCompany ? 'seller' : 'buyer');

  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(async () => {
    const [buyer, seller] = await Promise.all([
      fetchDeals('buyer'),
      hasCompany ? fetchDeals('seller') : Promise.resolve({ deals: [] as DealView[] }),
    ]);
    return { buyer: buyer.deals, seller: seller.deals };
  });

  const deals = (role === 'seller' ? data?.seller : data?.buyer) ?? [];

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
        <ErrorState error={error} fallback="Siparişler alınamadı" onRetry={reload} />
      </SafeAreaView>
    );
  }

  const switchRole = (next: Role) => {
    if (next === role) return;
    haptics.selection();
    setRole(next);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      {/* Firması olmayan kullanıcı satıcı olamaz: sekme çubuğu hiç çizilmez. */}
      {hasCompany ? (
        <View style={styles.tabBar}>
          <TabButton label="Aldıklarım" selected={role === 'buyer'} onPress={() => switchRole('buyer')} />
          <TabButton label="Sattıklarım" selected={role === 'seller'} onPress={() => switchRole('seller')} />
        </View>
      ) : null}

      <FlatList
        data={deals}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={refreshControl(refreshing, refresh)}
        ListHeaderComponent={
          error ? (
            <InlineError message={friendlyMessage(error, 'Siparişler alınamadı')} onRetry={reload} style={styles.banner} />
          ) : null
        }
        ListEmptyComponent={
          role === 'seller' ? (
            <EmptyState
              icon="cube-outline"
              title="Henüz satış kaydınız yok"
              message="Alıcı teklifinizi kabul ettiğinde sipariş kaydı burada açılır."
            />
          ) : (
            <EmptyState
              icon="cube-outline"
              title="Henüz sipariş kaydınız yok"
              message="Bir teklifi kabul ettiğinizde sipariş kaydı burada açılır."
              actionLabel="Tekliflerime git"
              onAction={() => navigation.navigate('QuoteRequests')}
            />
          )
        }
        renderItem={({ item, index }) => {
          const counterparty =
            role === 'seller'
              ? [item.buyer?.name, item.buyer?.company?.name].filter(Boolean).join(' · ') || 'Alıcı'
              : (item.sellerCompany?.name ?? 'Satıcı firma');
          return (
            <Pressable
              onPress={() => navigation.navigate('DealDetail', { dealId: item.id })}
              accessibilityRole="button"
              accessibilityLabel={`${item.product.code}, ${counterparty}, ${formatQuantity(item.quantity, item.unit)}${item.canReview ? ', değerlendirme bekliyor' : ''}. Siparişi aç`}
              android_ripple={{ color: colors.pressed }}
              style={({ pressed }) => [styles.row, index < deals.length - 1 && styles.rowDivider, pressed && styles.pressed]}
            >
              <View style={styles.texts}>
                <View style={styles.topLine}>
                  <Text style={styles.code}>{item.product.code}</Text>
                  <DealStatusBadge status={item.status} />
                </View>
                <Text style={styles.company} numberOfLines={1}>
                  {counterparty}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {formatQuantity(item.quantity, item.unit)}
                  {item.agreedDeliveryDate ? ` · termin ${formatQuoteDate(item.agreedDeliveryDate)}` : ''}
                </Text>
                {item.canReview ? (
                  <View style={styles.reviewFlag}>
                    <Ionicons name="star-outline" size={14} color={colors.warning} />
                    <Text style={styles.reviewFlagText}>Değerlendirme bekliyor</Text>
                  </View>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.chevron} />
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

function TabButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.tab, selected && styles.tabSelected, pressed && !selected && styles.pressed]}
    >
      <Text style={[styles.tabText, selected && styles.tabTextSelected]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  tabBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
  },
  tabSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { ...typography.label, fontFamily: fonts.semibold, color: colors.primary },
  tabTextSelected: { color: colors.primaryText },
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
  reviewFlag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  reviewFlagText: { ...typography.caption, fontFamily: fonts.semibold, color: colors.warning },
});
