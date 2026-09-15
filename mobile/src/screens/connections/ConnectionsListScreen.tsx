import React from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { fetchConnections } from '../../api/client';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { ListRow } from '../../components/ListRow';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { useFocusLoad } from '../../features/useFocusLoad';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Connections'>;

// Yeni düzen (5. aşama): kabul edilmiş bağlantılar çizgili kişi satırları olarak.
export function ConnectionsListScreen({ navigation }: Props) {
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchConnections().then(({ connections }) => connections)
  );
  const connections = data ?? [];

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <SkeletonList variant="person" />
      </SafeAreaView>
    );
  }

  if (status === 'error') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ErrorState error={error} fallback="Bağlantılar alınamadı" onRetry={reload} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <FlatList
        data={connections}
        keyExtractor={(item) => item.connectionId}
        contentContainerStyle={styles.listContent}
        refreshControl={refreshControl(refreshing, refresh)}
        ListHeaderComponent={
          error ? (
            <View style={styles.bannerWrap}>
              <InlineError message={friendlyMessage(error, 'Bağlantılar alınamadı')} onRetry={reload} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title="Henüz bağlantınız yok"
            message="Akışta ya da firma sayfalarında bir kişinin adına dokunup profilinden bağlantı kurabilirsiniz."
            actionLabel="Akışa git"
            onAction={() => navigation.navigate('MainTabs', { screen: 'Feed' })}
          />
        }
        renderItem={({ item, index }) => (
          <ListRow
            title={`${item.user.firstName} ${item.user.lastName}`}
            subtitle={item.user.position}
            left={<CompanyAvatar name={item.user.firstName} size={36} />}
            divider={index < connections.length - 1}
            onPress={() => navigation.navigate('Profile', { userId: item.user.id })}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingTop: spacing.blockGap, paddingBottom: spacing.xl },
  bannerWrap: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.blockGap },
});
