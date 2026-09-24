// Kayıt 6. adım: şirket / davet kodu (yeni tasarım, 4. adım).
// Veri katmanı aynı: kayıt tamamlanır, davet kodu cihazdan silinir, oturum açılır.
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { OnboardingLayout } from '../../components/OnboardingLayout';
import { useRegistration } from '../../context/RegistrationContext';
import { useSession } from '../../context/SessionContext';
import { registerUser } from '../../api/client';
import {
  clearStoredInviteCode,
  normalizeInviteCode,
  readStoredInviteCode,
} from '../../features/invites/storedCode';
import { tr } from '../../i18n';
import { useTheme } from '../../theme/ThemeContext';
import { Button, Icon, Input } from '../../ui';

type Props = NativeStackScreenProps<RootStackParamList, 'CompanyCode'>;

export function CompanyCodeScreen({ navigation }: Props) {
  const t = useTheme();
  const { draft, updateDraft } = useRegistration();
  const { login } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Davet bağlantısıyla gelindiyse kod cihazda duruyor (Faz 2, Adım 4); alan
  // dolu gelsin. Kullanıcı elle yazdıysa üzerine yazmayız.
  useEffect(() => {
    let cancelled = false;
    void readStoredInviteCode().then((code) => {
      if (cancelled || !code) return;
      updateDraft({ inviteCode: code });
    });
    return () => {
      cancelled = true;
    };
    // Yalnızca ilk açılışta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { token, user } = await registerUser(draft);
      // Kod kullanıldı: cihazdan silinsin ki sonraki kayıtta geri gelmesin.
      // Geçersiz kod kaydı engellemez (sunucu yok sayar), o yüzden burada da
      // koşulsuz siliyoruz.
      await clearStoredInviteCode();
      setSubmitting(false);
      // Gezinme çağrısı yok: user dolunca RootNavigator ana sekmelere geçiyor.
      login(token, user);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('Kayıt tamamlanamadı'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OnboardingLayout
      step={6}
      totalSteps={6}
      title={tr('Şirket kodu')}
      subtitle={tr('Firmanız zaten platformdaysa, mevcut çalışanlardan aldığınız kodu girin. Yeni firma kaydı yapıyorsanız boş bırakabilirsiniz.')}
      footer={<Button size="lg" label={tr('Kaydı Tamamla')} loading={submitting} onPress={handleSubmit} />}
    >
      <View style={{ gap: t.space[4], minWidth: 0 }}>
        <Input
          label={tr('Şirket kodu (opsiyonel)')}
          value={draft.companyCode}
          onChangeText={(companyCode) => updateDraft({ companyCode })}
          placeholder={tr('Örn. {code}', { code: 'AVD-4F82' })}
          autoCapitalize="characters"
        />
        {/* Davet kodu (Faz 2, Adım 4): isteğe bağlı. Davet bağlantısıyla
            gelindiyse dolu gelir; yanlış yazılsa da kayıt engellenmez. */}
        <Input
          label={tr('Davet kodu (opsiyonel)')}
          value={draft.inviteCode}
          onChangeText={(inviteCode) => updateDraft({ inviteCode: normalizeInviteCode(inviteCode) })}
          placeholder={tr('Örn. {code}', { code: 'K7M2QP4R' })}
          autoCapitalize="characters"
          helper={tr('Sizi davet eden kişinin kodu. Yazarsanız kayıt tamamlanınca o kişiyle bağlantınız kurulur.')}
        />
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
          {tr('Kayıt tamamlandığında firmanız "{name}" temel doğrulama incelemesine alınacak.', { name: draft.companyName || '—' })}
        </Text>
        {/* Hata: ikon + metin (DESIGN.md §6). */}
        {error ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.space[2],
              padding: t.space[3],
              borderRadius: t.radius.md,
              backgroundColor: t.colors.dangerSoft,
            }}
          >
            <Icon name="warning" size={t.size.iconSm} color="danger" />
            <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{error}</Text>
          </View>
        ) : null}
      </View>
    </OnboardingLayout>
  );
}
