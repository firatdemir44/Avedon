// Kayıt 5. adım: telefon doğrulama (yeni tasarım, 4. adım).
// Veri/işlev katmanı aynı: kod isteme, doğrulama, bireysel hesapta doğrudan
// kayıt, firmalı hesapta CompanyCode. Görünüm token'lar + `ui` bileşenleri.
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { OnboardingLayout } from '../../components/OnboardingLayout';
import { OtpCodeField } from '../../components/OtpCodeField';
import { useRegistration } from '../../context/RegistrationContext';
import { useSession } from '../../context/SessionContext';
import { ApiError, registerUser, requestOtp, verifyOtp } from '../../api/client';
import { tr } from '../../i18n';
import { clearStoredInviteCode } from '../../features/invites/storedCode';
import { setTeamLanding } from '../../features/invites/teamLanding';
import { useTheme } from '../../theme/ThemeContext';
import { Button, Icon } from '../../ui';

type Props = NativeStackScreenProps<RootStackParamList, 'PhoneVerification'>;

// Ekip davetiyle kayıtta sunucunun döndürdüğü hatalar (backend/src/invites.ts resolveTeamInvite).
function teamErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case 'already_registered_team_invite':
      return tr('Bu numarayla zaten bir hesap var; firmanız kendiliğinden değişmez. Giriş yapın ya da firmanızdan yardım isteyin.');
    case 'invite_used':
    case 'invite_not_found':
      return tr('Bu ekip daveti artık geçerli değil. Firmanızdan yeni bir davet isteyin.');
    case 'invite_phone_mismatch':
      return tr('Bu ekip daveti başka bir telefon numarası için. Davet edilen numarayla kayıt olun.');
    case 'inviter_has_no_company':
      return tr('Davet eden kişinin firması bulunamadı. Firmanızdan yeni bir davet isteyin.');
    default:
      return null;
  }
}

export function PhoneVerificationScreen({ navigation }: Props) {
  const t = useTheme();
  const { draft, updateDraft } = useRegistration();
  const { login } = useSession();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  useEffect(() => {
    requestOtp(draft.phone).catch(() => {
      // İlk otomatik gönderim başarısız olursa kullanıcı "tekrar gönder" ile deneyebilir.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResend = async () => {
    setResending(true);
    setError(null);
    try {
      await requestOtp(draft.phone);
      setCooldown(60);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'cooldown') {
        setCooldown((err.details as { retryAfterSeconds?: number })?.retryAfterSeconds ?? 60);
      } else {
        setError(tr('Kod gönderilemedi, lütfen tekrar deneyin.'));
      }
    } finally {
      setResending(false);
    }
  };

  const handleContinue = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await verifyOtp(draft.phone, code.trim());
      if (result.purpose === 'login') {
        setError(tr('Bu telefon numarası zaten kayıtlı.'));
        setAlreadyRegistered(true);
        return;
      }

      updateDraft({ verificationToken: result.verificationToken });

      // Ekip davetinde firma kodu adımı yok: kişi davet edenin firmasına katılır.
      if (draft.accountType !== 'bireysel' && !draft.teamCompanyName) {
        navigation.navigate('CompanyCode');
        return;
      }

      const { token, user } = await registerUser({ ...draft, verificationToken: result.verificationToken });
      if (draft.teamCompanyName) {
        await clearStoredInviteCode();
        setTeamLanding(user.companyId ?? null);
      }
      setSubmitting(false);
      // Gezinme çağrısı yok: user dolunca RootNavigator ana sekmelere geçiyor.
      login(token, user);
    } catch (err) {
      const errCode = err instanceof ApiError ? err.code : undefined;
      const teamMsg = teamErrorMessage(errCode);
      if (teamMsg) {
        setError(teamMsg);
        if (errCode === 'already_registered_team_invite') setAlreadyRegistered(true);
        return;
      }
      setError(
        errCode === 'mismatch'
          ? tr('Kod hatalı, tekrar deneyin.')
          : errCode === 'expired'
            ? tr('Kodun süresi doldu, yeni kod isteyin.')
            : errCode === 'max_attempts'
              ? tr('Çok fazla yanlış deneme yapıldı, yeni kod isteyin.')
              : err instanceof Error
                ? err.message
                : tr('Doğrulama başarısız')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OnboardingLayout
      step={draft.teamCompanyName ? 2 : 5}
      totalSteps={draft.teamCompanyName ? 2 : 6}
      title={tr('Telefonunuzu doğrulayın')}
      subtitle={draft.phone ? tr('{phone} numarasına gönderilen 6 haneli kodu girin.', { phone: draft.phone }) : tr('Telefon numaranıza gönderilen 6 haneli kodu girin')}
      footer={
        alreadyRegistered ? (
          <Button size="lg" label={tr("Giriş Yap'a Git")} onPress={() => navigation.replace('Login')} />
        ) : (
          <Button
            size="lg"
            label={tr('Doğrula ve Devam Et')}
            loading={submitting}
            disabled={code.trim().length !== 6}
            onPress={handleContinue}
          />
        )
      }
    >
      <View style={{ gap: t.space[3], minWidth: 0 }}>
        <OtpCodeField
          code={code}
          onChangeCode={setCode}
          onResend={handleResend}
          resendCooldownSeconds={cooldown}
          resending={resending}
        />
        {/* Hata: yalnız renk değil, ikon + metin (DESIGN.md §6). */}
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
