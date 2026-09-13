import React from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import type { MainTabScreenProps } from '../../navigation/types';
import { MenuRow } from '../../components/MenuRow';
import { useSession } from '../../context/SessionContext';
import { useUserProfile } from './useUserProfile';
import { ProfileIdentity } from './ProfileIdentity';
import { colors, spacing } from '../../theme';

type Props = MainTabScreenProps<'MyProfile'>;

// Kendi profilim + uygulamanın menü merkezi. Vizyondaki hamburger menünün
// karşılığı: ikincil hedefler (firmam, taleplerim, bağlantılar, çıkış) burada.
export function MyProfileScreen({ navigation }: Props) {
  const { user, logout } = useSession();
  const { profile, loading, error } = useUserProfile(user?.id ?? '');

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {profile ? (
          <ProfileIdentity
            profile={profile}
            onOpenCompany={(companyId) => navigation.navigate('CompanyProfile', { companyId })}
          />
        ) : (
          <Text style={styles.error}>{error ?? 'Profil alınamadı'}</Text>
        )}

        <View style={styles.menu}>
          {user?.companyId ? (
            <MenuRow label="Firmam" onPress={() => navigation.navigate('CompanyProfile')} />
          ) : null}
          <MenuRow label="Taleplerim" onPress={() => navigation.navigate('MySampleRequests')} />
          <MenuRow label="Bağlantılarım" onPress={() => navigation.navigate('Connections')} />
          <MenuRow label="Bağlantı İstekleri" onPress={() => navigation.navigate('ConnectionRequests')} />
          {user?.isAdmin ? <MenuRow label="Admin" onPress={() => navigation.navigate('Admin')} /> : null}
          {/* Çıkışta gezinme çağrısı yok: user null olunca RootNavigator zaten
              giriş ekranlarına geçiyor. */}
          <MenuRow label="Çıkış" variant="danger" onPress={logout} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  menu: { marginTop: spacing.xl },
  error: { fontSize: 14, color: colors.danger },
});
