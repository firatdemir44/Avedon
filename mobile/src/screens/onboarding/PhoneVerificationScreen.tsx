import React, { useEffect, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { OnboardingLayout } from '../../components/OnboardingLayout';
import { PrimaryButton } from '../../components/PrimaryButton';
import { OtpCodeField } from '../../components/OtpCodeField';
import { useRegistration } from '../../context/RegistrationContext';
import { useSession } from '../../context/SessionContext';
import { ApiError, registerUser, requestOtp, verifyOtp } from '../../api/client';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PhoneVerification'>;

export function PhoneVerificationScreen({ navigation }: Props) {
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
        setError('Kod gönderilemedi, lütfen tekrar deneyin.');
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
        setError('Bu telefon numarası zaten kayıtlı.');
        setAlreadyRegistered(true);
        return;
      }

      updateDraft({ verificationToken: result.verificationToken });

      if (draft.accountType !== 'bireysel') {
        navigation.navigate('CompanyCode');
        return;
      }

      const { token, user } = await registerUser({ ...draft, verificationToken: result.verificationToken });
      login(token, user);
      navigation.navigate('ProductList');
    } catch (err) {
      const errCode = err instanceof ApiError ? err.code : undefined;
      setError(
        errCode === 'mismatch'
          ? 'Kod hatalı, tekrar deneyin.'
          : errCode === 'expired'
            ? 'Kodun süresi doldu, yeni kod isteyin.'
            : errCode === 'max_attempts'
              ? 'Çok fazla yanlış deneme yapıldı, yeni kod isteyin.'
              : err instanceof Error
                ? err.message
                : 'Doğrulama başarısız'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OnboardingLayout
      step={5}
      totalSteps={6}
      title="Telefonunuzu doğrulayın"
      subtitle={`${draft.phone || 'Telefon numaranıza'} gönderilen 6 haneli kodu girin`}
    >
      <OtpCodeField
        code={code}
        onChangeCode={setCode}
        onResend={handleResend}
        resendCooldownSeconds={cooldown}
        resending={resending}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {alreadyRegistered ? (
        <PrimaryButton label="Giriş Yap'a Git" onPress={() => navigation.replace('Login')} />
      ) : (
        <PrimaryButton
          label={submitting ? 'Kaydediliyor...' : 'Doğrula ve Devam Et'}
          disabled={code.trim().length !== 6 || submitting}
          onPress={handleContinue}
        />
      )}
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  error: {
    fontSize: 13,
    color: colors.danger,
    marginBottom: spacing.md,
  },
});
