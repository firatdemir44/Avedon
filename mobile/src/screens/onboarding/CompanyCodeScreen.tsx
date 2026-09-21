import React, { useEffect, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { OnboardingLayout } from '../../components/OnboardingLayout';
import { PrimaryButton } from '../../components/PrimaryButton';
import { TextField } from '../../components/TextField';
import { useRegistration } from '../../context/RegistrationContext';
import { useSession } from '../../context/SessionContext';
import { registerUser } from '../../api/client';
import {
  clearStoredInviteCode,
  normalizeInviteCode,
  readStoredInviteCode,
} from '../../features/invites/storedCode';
import { colors, fonts, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'CompanyCode'>;

export function CompanyCodeScreen({ navigation }: Props) {
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
      setError(err instanceof Error ? err.message : 'Kayıt tamamlanamadı');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OnboardingLayout
      step={6}
      totalSteps={6}
      title="Şirket kodu"
      subtitle="Firmanız zaten platformdaysa, mevcut çalışanlardan aldığınız kodu girin. Yeni firma kaydı yapıyorsanız boş bırakabilirsiniz."
    >
      <TextField
        label="Şirket Kodu (opsiyonel)"
        value={draft.companyCode}
        onChangeText={(companyCode) => updateDraft({ companyCode })}
        placeholder="Örn. AVD-4F82"
        autoCapitalize="characters"
      />
      {/* Davet kodu (Faz 2, Adım 4): isteğe bağlı. Davet bağlantısıyla
          gelindiyse dolu gelir; yanlış yazılsa da kayıt engellenmez. */}
      <TextField
        label="Davet Kodu (opsiyonel)"
        value={draft.inviteCode}
        onChangeText={(inviteCode) => updateDraft({ inviteCode: normalizeInviteCode(inviteCode) })}
        placeholder="Örn. K7M2QP4R"
        autoCapitalize="characters"
      />
      <Text style={styles.hint}>
        Sizi davet eden kişinin kodu. Yazarsanız kayıt tamamlanınca o kişiyle bağlantınız kurulur.
      </Text>
      <Text style={styles.hint}>Kayıt tamamlandığında firmanız "{draft.companyName || '—'}" temel doğrulama incelemesine alınacak.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton label={submitting ? 'Kaydediliyor...' : 'Kaydı Tamamla'} disabled={submitting} onPress={handleSubmit} />
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  hint: {
    ...typography.label,
    fontFamily: fonts.regular,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  error: {
    ...typography.label,
    fontFamily: fonts.regular,
    color: colors.danger,
    marginBottom: spacing.md,
  },
});
