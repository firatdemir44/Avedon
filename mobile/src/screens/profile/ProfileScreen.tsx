import React, { useCallback, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { useUserProfile } from './useUserProfile';
import { ProfileIdentity } from './ProfileIdentity';
import { colors, spacing } from '../../theme';

type Props = RootStackScreenProps<'Profile'>;

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

  const handleConnect = async () => {
    setActionLoading(true);
    try {
      await sendConnectionRequest(userId);
      refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'İstek gönderilemedi');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenChat = async () => {
    if (!profile) return;
    setActionLoading(true);
    try {
      const { conversation } = await startConversation(userId);
      navigation.navigate('Chat', {
        conversationId: conversation.id,
        title: `${profile.firstName} ${profile.lastName}`,
      });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Sohbet açılamadı');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRespond = async (nextStatus: 'accepted' | 'rejected') => {
    if (!status?.connectionId) return;
    setActionLoading(true);
    try {
      await respondToConnectionRequest(status.connectionId, nextStatus);
      refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'İşlem yapılamadı');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Text style={styles.empty}>{loadError ?? 'Profil bulunamadı'}</Text>
      </SafeAreaView>
    );
  }

  const error = actionError ?? loadError;

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={styles.content}>
        <ProfileIdentity
          profile={profile}
          onOpenCompany={(companyId) => navigation.navigate('CompanyProfile', { companyId })}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!isSelf && status ? (
          <View style={styles.actions}>
            {status.status === 'none' ? (
              <PrimaryButton label="Bağlantı Kur" onPress={handleConnect} disabled={actionLoading} />
            ) : null}
            {status.status === 'pending_sent' ? (
              <PrimaryButton label="İstek Gönderildi" onPress={() => {}} disabled />
            ) : null}
            {status.status === 'pending_received' ? (
              <View style={styles.actionRow}>
                <PrimaryButton
                  label="Kabul Et"
                  onPress={() => handleRespond('accepted')}
                  disabled={actionLoading}
                  style={styles.actionButton}
                />
                <PrimaryButton
                  label="Reddet"
                  variant="secondary"
                  onPress={() => handleRespond('rejected')}
                  disabled={actionLoading}
                  style={styles.actionButton}
                />
              </View>
            ) : null}
            {status.status === 'accepted' ? (
              <>
                <Text style={styles.connectedNote}>Bağlantıdasınız</Text>
                <PrimaryButton label="Mesaj Gönder" onPress={handleOpenChat} disabled={actionLoading} />
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  actions: { marginTop: spacing.lg },
  connectedNote: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1 },
  error: { fontSize: 13, color: colors.danger, marginTop: spacing.md },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
});
