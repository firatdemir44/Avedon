// Başkasının profili (yeni tasarım, 4. adım): kimlik kartı (ProfileIdentity),
// Deneyim ve bağlantı durumuna göre eylem bloğu. Eylem sonuçları titreşimle.
// Ekranda en fazla 1 dolu (primary) düğme var.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useCallback, useState } from 'react';
import { View, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { RootStackScreenProps } from '../../navigation/types';
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
import { InlineError } from '../../components/StateView';
import { tr } from '../../i18n';
import { useTheme } from '../../theme/ThemeContext';
import { Button, EmptyState, Icon, Screen, Skeleton, SkeletonRow, type AnyIconName } from '../../ui';
import type { ColorTokens } from '../../theme/tokens';

type Props = RootStackScreenProps<'Profile'>;

export function ProfileScreen({ navigation, route }: Props) {
  const t = useTheme();
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
    }, tr('İstek gönderilemedi'));

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
    }, tr('Sohbet açılamadı'));

  const handleRespond = (nextStatus: 'accepted' | 'rejected') =>
    runAction(async () => {
      if (!status?.connectionId) return;
      await respondToConnectionRequest(status.connectionId, nextStatus);
      if (nextStatus === 'accepted') haptics.success();
      refresh();
    }, tr('İşlem yapılamadı'));

  if (loading) {
    return (
      <Screen>
        <View style={{ gap: t.space[4] }}>
          <Skeleton height={t.size.toolBox + t.size.thumb} />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen>
        {loadError ? (
          <EmptyState
            icon="cloud-offline-outline"
            title={tr('Profil yüklenemedi')}
            description={loadError}
            actionLabel={tr('Tekrar dene')}
            onAction={refresh}
          />
        ) : (
          <EmptyState icon="user" title={tr('Profil bulunamadı')} description={tr('Bu kişi kaldırılmış olabilir.')} />
        )}
      </Screen>
    );
  }

  const error = actionError ?? loadError;

  return (
    <Screen>
      <ProfileIdentity
        profile={profile}
        onOpenCompany={(companyId) => navigation.navigate('CompanyProfile', { companyId })}
      />

      <ExperienceSection experiences={profile.experiences ?? []} />

      {error ? <InlineError message={error} /> : null}

      {!isSelf && status ? (
        <View style={{ gap: t.space[3], minWidth: 0 }}>
          {status.status === 'none' ? (
            <Button
              size="lg"
              icon="person-add-outline"
              label={tr('Bağlantı kur')}
              loading={actionLoading}
              onPress={handleConnect}
            />
          ) : null}

          {status.status === 'pending_sent' ? (
            <StateLine icon="clock" color="warning" text={tr('Bağlantı isteği gönderildi, yanıt bekleniyor.')} />
          ) : null}

          {status.status === 'pending_received' ? (
            <>
              <StateLine icon="person-add-outline" color="brand" text={tr('Size bağlantı isteği gönderdi.')} />
              <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                <Button
                  style={{ flex: 1, minWidth: 0 }}
                  icon="check"
                  label={tr('Kabul et')}
                  loading={actionLoading}
                  onPress={() => handleRespond('accepted')}
                />
                <Button
                  style={{ flex: 1, minWidth: 0 }}
                  kind="secondary"
                  label={tr('Reddet')}
                  disabled={actionLoading}
                  onPress={() => handleRespond('rejected')}
                />
              </View>
            </>
          ) : null}

          {status.status === 'accepted' ? (
            <>
              <StateLine icon="check" color="success" text={tr('Bağlantıdasınız.')} />
              <Button
                size="lg"
                icon="message"
                label={tr('Mesaj gönder')}
                loading={actionLoading}
                onPress={handleOpenChat}
              />
            </>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

// Durum satırı: ikon + metin (durum yalnız renkle verilmez, DESIGN.md §6).
function StateLine({ icon, color, text }: { icon: AnyIconName; color: keyof ColorTokens; text: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minWidth: 0 }}>
      <Icon name={icon} size={t.size.iconSm} color={color} />
      <Text style={[t.type.body16, { color: t.colors.ink, flex: 1, minWidth: 0 }]}>{text}</Text>
    </View>
  );
}
