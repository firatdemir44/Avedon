import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { TextField } from '../../components/TextField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { OtpCodeField } from '../../components/OtpCodeField';
import { useSession } from '../../context/SessionContext';
import { ApiError, requestOtp, verifyOtp } from '../../api/client';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { login } = useSession();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await requestOtp(phone.trim());
      setStep('code');
      setCooldown(60);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'cooldown') {
        setStep('code');
        setCooldown((err.details as { retryAfterSeconds?: number })?.retryAfterSeconds ?? 60);
      } else {
        setError('Kod gönderilemedi, lütfen tekrar deneyin.');
      }
    } finally {
      setSubmitting(false);
      setResending(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError(null);
    try {
      await requestOtp(phone.trim());
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

  const handleVerify = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await verifyOtp(phone.trim(), code.trim());
      if (result.purpose === 'login') {
        login(result.token, result.user);
        navigation.reset({ index: 0, routes: [{ name: 'ProductList' }] });
      } else {
        setError('Bu telefon numarasıyla kayıtlı hesap bulunamadı. Önce kayıt olmanız gerekiyor.');
      }
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setError(
        code === 'mismatch'
          ? 'Kod hatalı, tekrar deneyin.'
          : code === 'expired'
            ? 'Kodun süresi doldu, yeni kod isteyin.'
            : code === 'max_attempts'
              ? 'Çok fazla yanlış deneme yapıldı, yeni kod isteyin.'
              : 'Doğrulama başarısız, lütfen tekrar deneyin.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>Giriş Yap</Text>
        <Text style={styles.subtitle}>
          {step === 'phone'
            ? 'Kayıtlı telefon numaranızı girin, size bir doğrulama kodu gönderelim.'
            : `${phone} numarasına gönderilen 6 haneli kodu girin.`}
        </Text>

        {step === 'phone' ? (
          <TextField
            label="Telefon"
            value={phone}
            onChangeText={setPhone}
            placeholder="05XX XXX XX XX"
            keyboardType="phone-pad"
          />
        ) : (
          <OtpCodeField
            code={code}
            onChangeCode={setCode}
            onResend={handleResend}
            resendCooldownSeconds={cooldown}
            resending={resending}
          />
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {step === 'phone' ? (
          <PrimaryButton
            label={submitting ? 'Gönderiliyor...' : 'Kod Gönder'}
            disabled={submitting || phone.trim().length < 10}
            onPress={sendCode}
          />
        ) : (
          <PrimaryButton
            label={submitting ? 'Doğrulanıyor...' : 'Giriş Yap'}
            disabled={submitting || code.trim().length !== 6}
            onPress={handleVerify}
          />
        )}

        <PrimaryButton
          label="Hesabım Yok, Kayıt Ol"
          variant="secondary"
          onPress={() => navigation.replace('RoleSelection')}
          style={{ marginTop: spacing.sm }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: spacing.lg, justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  subtitle: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.lg },
  error: { fontSize: 13, color: colors.danger, marginBottom: spacing.md },
});
