import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { ApiError, fetchInviteByCode, type InvitePreview } from '../api/client';
import { clearStoredInviteCode, readStoredInviteCode } from '../features/invites/storedCode';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../ui';
import { tr } from '../i18n';

// Davet bağlantısıyla gelen kişiye ince karşılama şeridi (Faz 2, Adım 4).
// Oturumsuz karşılama ve giriş ekranlarının üstünde durur. Kod yoksa ya da
// sunucu 404 derse (iptal edilmiş / yanlış kod) hiçbir şey çizilmez; geçersiz
// kod cihazdan da silinir ki kayıt alanına boşuna gelmesin.
// Görünüm yeni tasarım (4. adım): `brandSoft` zemin, `brand` ikon + metin.
export function InviteBanner() {
  const t = useTheme();
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
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space[2],
        backgroundColor: t.colors.brandSoft,
        paddingHorizontal: t.space[4],
        paddingVertical: t.space[3],
      }}
    >
      <Icon name="person-add-outline" size={t.size.iconSm} color="brand" />
      {/* Uzun firma adlarında 375 px'te taşmasın. */}
      <Text style={[t.type.body14, { color: t.colors.brand, flex: 1, minWidth: 0 }]}>
        {invite.relation === 'ekip' && invite.inviterCompany
          ? tr('{company} ekibine davet edildiniz', { company: invite.inviterCompany })
          : tr("{who} sizi Takyon'a davet etti.", { who })}
      </Text>
    </View>
  );
}
