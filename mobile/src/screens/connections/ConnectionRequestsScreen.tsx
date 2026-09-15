import React, { useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { PrimaryButton } from '../../components/PrimaryButton';
import { fetchIncomingConnectionRequests, respondToConnectionRequest } from '../../api/client';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useFocusLoad } from '../../features/useFocusLoad';
import { colors, fonts, radius, shadow, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ConnectionRequests'>;

export function ConnectionRequestsScreen({ navigation }: Props) {
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchIncomingConnectionRequests().then(({ requests }) => requests)
  );
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleRespond = async (id: string, nextStatus: 'accepted' | 'rejected') => {
    setUpdatingId(id);
    setActionError(null);
    try {
      await respondToConnectionRequest(id, nextStatus);
      await reload();
    } catch (err) {
      setActionError(friendlyMessage(err, 'İşlem yapılamadı'));
    } finally {
      setUpdatingId(null);
    }
  };

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
        <ErrorState error={error} fallback="İstekler alınamadı" onRetry={reload} />
      </SafeAreaView>
    );
  }

  const bannerMessage = actionError ?? (error ? friendlyMessage(error, 'İstekler alınamadı') : null);

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
        ListEmptyComponent={
          <EmptyState
            icon="person-add-outline"
            title="Bekleyen istek yok"
            message="Biri size bağlantı isteği gönderdiğinde burada kabul edebilir ya da reddedebilirsiniz."
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable onPress={() => navigation.navigate('Profile', { userId: item.requester.id })}>
              <Text style={styles.name}>
                {item.requester.firstName} {item.requester.lastName}
              </Text>
              <Text style={styles.meta}>{item.requester.position}</Text>
            </Pressable>
            <View style={styles.actionRow}>
              <PrimaryButton
                label={updatingId === item.id ? 'İşleniyor...' : 'Kabul Et'}
                disabled={updatingId === item.id}
                onPress={() => handleRespond(item.id, 'accepted')}
                style={styles.actionButton}
              />
              <PrimaryButton
                label="Reddet"
                variant="secondary"
                disabled={updatingId === item.id}
                onPress={() => handleRespond(item.id, 'rejected')}
                style={styles.actionButton}
              />
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
  name: { ...typography.subtitle, fontFamily: fonts.bold, color: colors.text },
  meta: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted, marginTop: 2 },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionButton: { flex: 1 },
});
