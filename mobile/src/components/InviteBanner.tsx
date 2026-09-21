import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, fetchInviteByCode, type InvitePreview } from '../api/client';
import { clearStoredInviteCode, readStoredInviteCode } from '../features/invites/storedCode';
import { colors, fonts, spacing, typography } from '../theme';

// Davet bağlantısıyla gelen kişiye ince karşılama şeridi (Faz 2, Adım 4).
// Oturumsuz karşılama ve giriş ekranlarının üstünde durur. Kod yoksa ya da
// sunucu 404 derse (iptal edilmiş / yanlış kod) hiçbir şey çizilmez; geçersiz
// kod cihazdan da silinir ki kayıt alanına boşuna gelmesin.
export function InviteBanner() {
  const [invite, setInvite] = useState<InvitePreview | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const code = await readStoredInviteCode();
      if (!code || cancelled) return;
      try {
        const { invite: found } = await fetchInviteByCode(code);
        if (!cancelled) setInvite(found);
      } catch (err) {
        // Yalnızca 404'te (iptal edilmiş / yanlış kod) silinir; ağ hatasında kod kalır.
        if (err instanceof ApiError && err.status === 404) await clearStoredInviteCode();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!invite) return null;

  const who = invite.inviterCompany ? `${invite.inviterName} (${invite.inviterCompany})` : invite.inviterName;

  return (
    <View style={styles.banner}>
      <Ionicons name="person-add-outline" size={18} color={colors.primary} />
      <Text style={styles.text}>{who} sizi Avedon'a davet etti.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
  },
  text: { ...typography.caption, fontFamily: fonts.medium, color: colors.primary, flex: 1, minWidth: 0 },
});
