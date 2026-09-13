import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useSession } from '../../context/SessionContext';
import {
  ApiError,
  fetchConnectionStatus,
  fetchUserProfile,
  respondToConnectionRequest,
  sendConnectionRequest,
  type ConnectionStatusResult,
  type PublicUserProfile,
} from '../../api/client';
import { colors, radius, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

export function ProfileScreen({ navigation, route }: Props) {
  const { userId } = route.params;
  const { user: currentUser } = useSession();
  const isSelf = currentUser?.id === userId;

  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [status, setStatus] = useState<ConnectionStatusResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchUserProfile(userId), isSelf ? Promise.resolve(null) : fetchConnectionStatus(userId)])
      .then(([{ user }, statusResult]) => {
        setProfile(user);
        setStatus(statusResult);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Profil alınamadı'))
      .finally(() => setLoading(false));
  }, [userId, isSelf]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleConnect = async () => {
    setActionLoading(true);
    try {
      await sendConnectionRequest(userId);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'İstek gönderilemedi');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRespond = async (nextStatus: 'accepted' | 'rejected') => {
    if (!status?.connectionId) return;
    setActionLoading(true);
    try {
      await respondToConnectionRequest(status.connectionId, nextStatus);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'İşlem yapılamadı');
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

  if (error && !profile) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Text style={styles.empty}>{error}</Text>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Text style={styles.empty}>Profil bulunamadı</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.name}>
          {profile.firstName} {profile.lastName}
        </Text>
        <Text style={styles.position}>{profile.position}</Text>

        {profile.company ? (
          <Pressable onPress={() => navigation.navigate('CompanyProfile', { companyId: profile.company!.id })}>
            <Text style={styles.companyLink}>{profile.company.name}</Text>
          </Pressable>
        ) : null}

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Telefon</Text>
          <Text style={profile.phone ? styles.rowValue : styles.rowValuePlaceholder}>
            {profile.phone ?? 'Bağlantı kurulması gerekmektedir'}
          </Text>
        </View>

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
              <PrimaryButton label="Bağlantıdasınız" onPress={() => {}} disabled />
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
  name: { fontSize: 24, fontWeight: '700', color: colors.text },
  position: { fontSize: 15, color: colors.textMuted, marginTop: spacing.xs },
  companyLink: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
    marginTop: spacing.sm,
  },
  row: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  rowLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 2,
  },
  rowValue: {
    fontSize: 15,
    color: colors.text,
  },
  rowValuePlaceholder: {
    fontSize: 14,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  actions: {
    marginTop: spacing.lg,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  error: {
    fontSize: 13,
    color: colors.danger,
    marginTop: spacing.md,
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.xl,
  },
});
