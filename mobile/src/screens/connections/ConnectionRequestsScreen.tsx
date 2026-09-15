import React, { useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { PrimaryButton } from '../../components/PrimaryButton';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { fetchIncomingConnectionRequests, respondToConnectionRequest } from '../../api/client';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useFocusLoad } from '../../features/useFocusLoad';
import { haptics } from '../../features/haptics';
import { colors, fonts, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ConnectionRequests'>;

// Yeni düzen (5. aşama): çizgili istek satırları. Kişi alanı (profile gider) ile
// Kabul Et / Reddet düğmeleri kardeş öğeler; web'de iç içe düğme oluşmuyor.
export function ConnectionRequestsScreen({ navigation }: Props) {
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(() =>
    fetchIncomingConnectionRequests().then(({ requests }) => requests)
  );
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const requests = data ?? [];

  const handleRespond = async (id: string, nextStatus: 'accepted' | 'rejected') => {
    setUpdatingId(id);
    setActionError(null);
    try {
      await respondToConnectionRequest(id, nextStatus);
      if (nextStatus === 'accepted') haptics.success();
      await reload();
    } catch (err) {
      haptics.error();
      setActionError(friendlyMessage(err, 'İşlem yapılamadı'));
    } finally {
      setUpdatingId(null);
    }
  };

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
        <ErrorState error={error} fallback="İstekler alınamadı" onRetry={reload} />
      </SafeAreaView>
    );
  }

  const bannerMessage = actionError ?? (error ? friendlyMessage(error, 'İstekler alınamadı') : null);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={refreshControl(refreshing, refresh)}
        ListHeaderComponent={
          bannerMessage ? (
            <View style={styles.bannerWrap}>
              <InlineError message={bannerMessage} onRetry={actionError ? undefined : reload} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="person-add-outline"
            title="Bekleyen istek yok"
            message="Biri size bağlantı isteği gönderdiğinde burada kabul edebilir ya da reddedebilirsiniz."
          />
        }
        renderItem={({ item, index }) => {
          const name = `${item.requester.firstName} ${item.requester.lastName}`;
          const busy = updatingId === item.id;
          return (
            <View style={[styles.row, index < requests.length - 1 && styles.rowDivider]}>
              <Pressable
                onPress={() => navigation.navigate('Profile', { userId: item.requester.id })}
                accessibilityRole="button"
                accessibilityLabel={`${name}, ${item.requester.position}, profili aç`}
                style={({ pressed }) => [styles.person, pressed && styles.pressedFade]}
              >
                <CompanyAvatar name={item.requester.firstName} size={36} />
                <View style={styles.personTexts}>
                  <Text style={styles.name} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.requester.position}
                  </Text>
                </View>
              </Pressable>
              <View style={styles.actionRow}>
                <PrimaryButton
                  label={busy ? 'İşleniyor' : 'Kabul Et'}
                  icon="checkmark"
                  disabled={busy}
                  onPress={() => handleRespond(item.id, 'accepted')}
                  accessibilityLabel={`${name} isteğini kabul et`}
                  style={styles.actionButton}
                />
                <PrimaryButton
                  label="Reddet"
                  variant="outline"
                  disabled={busy}
                  onPress={() => handleRespond(item.id, 'rejected')}
                  accessibilityLabel={`${name} isteğini reddet`}
                  style={styles.actionButton}
                />
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingTop: spacing.blockGap, paddingBottom: spacing.xl },
  bannerWrap: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.blockGap },
  row: { backgroundColor: colors.surface, paddingHorizontal: spacing.gutter, paddingVertical: 12, gap: 10 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pressedFade: { opacity: 0.6 },
  personTexts: { flex: 1, gap: 1 },
  name: { ...typography.subtitle, color: colors.text },
  meta: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1, paddingHorizontal: spacing.sm },
});
