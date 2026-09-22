import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { RootStackScreenProps } from '../../navigation/types';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useSession } from '../../context/SessionContext';
import {
  ApiError,
  fetchConnectionStatus,
  respondToConnectionRequest,
  sendConnectionRequest,
  startConversation,
  type ConnectionStatusResult,
} from '../../api/client';
import { haptics } from '../../features/haptics';
import { useUserProfile } from './useUserProfile';
import { ProfileIdentity } from './ProfileIdentity';
import { ExperienceSection } from './ExperienceSection';
import { SkeletonDetail } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError } from '../../components/StateView';
import { colors, fonts, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'Profile'>;

// Başkasının profili: kimlik bloğu (ProfileIdentity) ve bağlantı durumuna göre
// eylem bloğu. Eylem sonuçları titreşimle: kurma/kabul başarı, hata hata.
export function ProfileScreen({ navigation, route }: Props) {
  const { userId } = route.params;
  const { user: currentUser } = useSession();
  const isSelf = currentUser?.id === userId;

  const { profile, loading, error: loadError, reload } = useUserProfile(userId);
  const [status, setStatus] = useState<ConnectionStatusResult | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadStatus = useCallback(() => {
    if (isSelf) return;
    fetchConnectionStatus(userId)
      .then(setStatus)
      .catch(() => {});
  }, [userId, isSelf]);

  useFocusEffect(
    useCallback(() => {
      loadStatus();
    }, [loadStatus])
  );

  const refresh = () => {
    reload();
    loadStatus();
  };

  const runAction = async (action: () => Promise<void>, fallback: string) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      haptics.error();
      setActionError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConnect = () =>
    runAction(async () => {
      await sendConnectionRequest(userId);
      haptics.success();
      refresh();
    }, 'İstek gönderilemedi');

  const handleOpenChat = () =>
    runAction(async () => {
      if (!profile) return;
      const { conversation } = await startConversation(userId);
      navigation.navigate('Chat', {
        conversationId: conversation.id,
        title: `${profile.firstName} ${profile.lastName}`,
        userId: profile.id,
        avatarUpdatedAt: profile.avatarUpdatedAt,
      });
    }, 'Sohbet açılamadı');

  const handleRespond = (nextStatus: 'accepted' | 'rejected') =>
    runAction(async () => {
      if (!status?.connectionId) return;
      await respondToConnectionRequest(status.connectionId, nextStatus);
      if (nextStatus === 'accepted') haptics.success();
      refresh();
    }, 'İşlem yapılamadı');

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <SkeletonDetail variant="profile" />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {loadError ? (
          <ErrorState error={loadError} onRetry={refresh} />
        ) : (
          <EmptyState icon="person-outline" title="Profil bulunamadı" />
        )}
      </SafeAreaView>
    );
  }

  const error = actionError ?? loadError;

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ProfileIdentity
          profile={profile}
          onOpenCompany={(companyId) => navigation.navigate('CompanyProfile', { companyId })}
        />

        <ExperienceSection experiences={profile.experiences ?? []} />

        {error ? (
          <View style={styles.bannerWrap}>
            <InlineError message={error} />
          </View>
        ) : null}

        {!isSelf && status ? (
          <View style={styles.actions}>
            {status.status === 'none' ? (
              <PrimaryButton
                label="Bağlantı Kur"
                icon="person-add-outline"
                size="lg"
                onPress={handleConnect}
                disabled={actionLoading}
              />
            ) : null}

            {status.status === 'pending_sent' ? (
              <StateLine icon="time-outline" color={colors.warning} text="Bağlantı isteği gönderildi, yanıt bekleniyor." />
            ) : null}

            {status.status === 'pending_received' ? (
              <>
                <StateLine icon="person-add-outline" color={colors.primary} text="Size bağlantı isteği gönderdi." />
                <View style={styles.actionRow}>
                  <PrimaryButton
                    label="Kabul Et"
                    icon="checkmark"
                    size="lg"
                    onPress={() => handleRespond('accepted')}
                    disabled={actionLoading}
                    style={styles.actionButton}
                  />
                  <PrimaryButton
                    label="Reddet"
                    variant="outline"
                    size="lg"
                    onPress={() => handleRespond('rejected')}
                    disabled={actionLoading}
                    style={styles.actionButton}
                  />
                </View>
              </>
            ) : null}

            {status.status === 'accepted' ? (
              <>
                <StateLine icon="checkmark-circle" color={colors.success} text="Bağlantıdasınız." />
                <PrimaryButton
                  label="Mesaj Gönder"
                  icon="chatbubble-outline"
                  size="lg"
                  onPress={handleOpenChat}
                  disabled={actionLoading}
                />
              </>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function StateLine({
  icon,
  color,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  text: string;
}) {
  return (
    <View style={styles.stateLine}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={styles.stateText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { gap: spacing.blockGap, paddingBottom: spacing.xl },
  bannerWrap: { paddingHorizontal: spacing.gutter },
  actions: { backgroundColor: colors.surface, padding: spacing.gutter, gap: spacing.sm },
  stateLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stateText: { ...typography.body, fontFamily: fonts.medium, color: colors.text, flex: 1 },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1 },
});
