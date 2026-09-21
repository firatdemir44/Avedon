import React, { useCallback, useLayoutEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { MainTabScreenProps } from '../../navigation/types';
import { fetchIncomingConnectionRequests } from '../../api/client';
import { ListRow } from '../../components/ListRow';
import { NotificationBell } from '../../components/NotificationBell';
import { SkeletonDetail } from '../../components/Skeleton';
import { InlineError } from '../../components/StateView';
import { useSession } from '../../context/SessionContext';
import { useUserProfile } from './useUserProfile';
import { ProfileIdentity } from './ProfileIdentity';
import { colors, fonts, radius, spacing } from '../../theme';

type Props = MainTabScreenProps<'MyProfile'>;

type MenuItem = { key: string; title: string; onPress: () => void; badge?: number };

// Kendi profilim + uygulamanın menü merkezi (taslak CProfil.dc.html): kimlik
// bloğu, tek beyaz blokta çizgili menü satırları, ayrı blokta Çıkış.
export function MyProfileScreen({ navigation }: Props) {
  const { user, logout } = useSession();
  const { profile, loading, error, reload } = useUserProfile(user?.id ?? '');
  const [pendingRequests, setPendingRequests] = useState(0);

  // Bildirim zili ana sekmelerin başlığında ortak (components/NotificationBell).
  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: () => <NotificationBell /> });
  }, [navigation]);

  // Taslakta "Bağlantı İstekleri" satırında bekleyen istek sayısı rozeti var.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchIncomingConnectionRequests()
        .then(({ requests }) => {
          if (!cancelled) setPendingRequests(requests.length);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const menu = [
    user?.companyId ? { key: 'company', title: 'Firmam', onPress: () => navigation.navigate('CompanyProfile') } : null,
    { key: 'sampleRequests', title: 'Taleplerim', onPress: () => navigation.navigate('MySampleRequests') },
    // Faz 2, Adım 2: teklif istekleri (verdiğim + firmama gelen).
    { key: 'quoteRequests', title: 'Tekliflerim', onPress: () => navigation.navigate('QuoteRequests') },
    // Faz 3, Adım 4: kabul edilen tekliften doğan sipariş kayıtları.
    { key: 'deals', title: 'Siparişlerim', onPress: () => navigation.navigate('Deals') },
    { key: 'favorites', title: 'Takip Ettiklerim', onPress: () => navigation.navigate('FavoriteProducts') },
    // Faz 2, Adım 6: iplik dizini (Ürünler sekmesindeki "İplik" ile aynı ekran).
    { key: 'yarnDirectory', title: 'İplik Dizini', onPress: () => navigation.navigate('YarnDirectory') },
    // Faz 3, Adım 3: elindeki kumaşın fotoğrafıyla görünüşçe benzerini bulma.
    { key: 'similarSearch', title: 'Fotoğrafla Kumaş Ara', onPress: () => navigation.navigate('SimilarSearch') },
    // Faz 2, Adım 5: makine parkına göre fason kapasite araması.
    { key: 'capacitySearch', title: 'Fason Kapasite Ara', onPress: () => navigation.navigate('CapacitySearch') },
    user?.companyId
      ? { key: 'machinePark', title: 'Makine Parkım', onPress: () => navigation.navigate('MachinePark') }
      : null,
    // Faz 2, Adım 1: izleme kuralları ("bu kalitede ürün çıkınca haber ver").
    { key: 'watchRules', title: 'İzlediklerim', onPress: () => navigation.navigate('WatchRules') },
    { key: 'recentlyViewed', title: 'Son Baktıklarım', onPress: () => navigation.navigate('RecentlyViewedProducts') },
    { key: 'connections', title: 'Bağlantılarım', onPress: () => navigation.navigate('Connections') },
    {
      key: 'connectionRequests',
      title: 'Bağlantı İstekleri',
      onPress: () => navigation.navigate('ConnectionRequests'),
      badge: pendingRequests,
    },
    user?.isAdmin ? { key: 'admin', title: 'Firma Doğrulama (Admin)', onPress: () => navigation.navigate('Admin') } : null,
  ].filter((item): item is MenuItem => item !== null);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Menü profil yüklenirken ya da yüklenemese de hep erişilebilir
            (özellikle Çıkış): eskiden yükleme sürerken ekran tamamen boştu. */}
        {loading ? (
          <SkeletonDetail variant="profile" />
        ) : profile ? (
          <ProfileIdentity
            profile={profile}
            onOpenCompany={(companyId) => navigation.navigate('CompanyProfile', { companyId })}
          />
        ) : (
          <View style={styles.bannerWrap}>
            <InlineError message={error ?? 'Profil alınamadı'} onRetry={reload} />
          </View>
        )}

        <View style={styles.block}>
          {menu.map((item, index) => (
            <ListRow
              key={item.key}
              title={item.title}
              divider={index < menu.length - 1}
              onPress={item.onPress}
              accessibilityLabel={item.badge ? `${item.title}, ${item.badge} bekleyen` : item.title}
              right={
                item.badge ? (
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{item.badge}</Text>
                  </View>
                ) : undefined
              }
            />
          ))}
        </View>

        <View style={styles.block}>
          {/* Çıkışta gezinme çağrısı yok: user null olunca RootNavigator zaten
              giriş ekranlarına geçiyor. */}
          <ListRow title="Çıkış" tone="danger" chevron={false} divider={false} onPress={logout} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { gap: spacing.blockGap, paddingBottom: spacing.xl },
  block: { backgroundColor: colors.surface },
  bannerWrap: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.notification,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  countBadgeText: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, color: colors.primaryText },
});
