// Hesap menüsü (tasarım incelemesi 2026-09-23): ana sayfadaki profil
// avatarından açılan alt sayfa. Profilim, Görünüm (tema) ve Çıkış burada;
// "Araçlar" sekmesi yalnızca araçları taşır.
import React from 'react';
import { useSession } from '../context/SessionContext';
import { useTheme } from '../theme/ThemeContext';
import { BottomSheet, Button, Icon, ListRow } from '../ui';
import { ThemeSwitch } from './ThemeSwitch';
import { LanguageSwitch } from './LanguageSwitch';
import { tr } from '../i18n';
import { UserAvatar } from './UserAvatar';

export interface AccountSheetProps {
  visible: boolean;
  onClose: () => void;
  onOpenProfile: () => void;
  /** Firmaya bağlı kullanıcıda "Firmam" satırı. */
  onOpenCompany?: () => void;
}

export function AccountSheet({ visible, onClose, onOpenProfile, onOpenCompany }: AccountSheetProps) {
  const t = useTheme();
  const { user, logout } = useSession();
  const name = user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : '';

  return (
    <BottomSheet visible={visible} onClose={onClose} title={tr('Hesabım')}>
      <ListRow
        title={tr('Profilim')}
        subtitle={name || undefined}
        left={
          user ? (
            <UserAvatar
              userId={user.id}
              firstName={user.firstName}
              lastName={user.lastName}
              avatarUpdatedAt={user.avatarUpdatedAt ?? null}
              size={t.size.avatar}
            />
          ) : (
            <Icon name="user" color="brand" />
          )
        }
        onPress={() => {
          onClose();
          onOpenProfile();
        }}
      />
      {onOpenCompany ? (
        <ListRow
          title={tr('Firmam')}
          left={<Icon name="business-outline" color="brand" />}
          onPress={() => {
            onClose();
            onOpenCompany();
          }}
        />
      ) : null}
      <ThemeSwitch />
      <LanguageSwitch />
      <Button
        kind="danger"
        fullWidth
        icon="log-out-outline"
        label={tr('Çıkış yap')}
        onPress={() => {
          onClose();
          logout();
        }}
      />
    </BottomSheet>
  );
}
