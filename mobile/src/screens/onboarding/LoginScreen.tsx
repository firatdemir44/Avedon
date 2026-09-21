import React, { useState } from 'react';
import { View, Text, TextInput, Image, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { PrimaryButton } from '../../components/PrimaryButton';
import { OtpCodeField } from '../../components/OtpCodeField';
import { InviteBanner } from '../../components/InviteBanner';
import { useSession } from '../../context/SessionContext';
import { ApiError, requestOtp, verifyOtp } from '../../api/client';
import { haptics } from '../../features/haptics';
import { colors, fonts, radius, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

// Taslak: docs/tasarim-yonleri/CGiris.dc.html. Üstte lacivert marka bloğu,
// altında beyaz zeminde başlık, eşit aralıklı telefon alanı ve 48px düğmeler.
export function LoginScreen({ navigation }: Props) {
  const { login } = useSession();
  const insets = useSafeAreaInsets();
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
        haptics.error();
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
        haptics.error();
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
        haptics.success();
        // Gezinme çağrısı gerekmiyor: user dolunca RootNavigator ana sekmelere geçiyor.
        login(result.token, result.user);
      } else {
        haptics.error();
        setError('Bu telefon numarasıyla kayıtlı hesap bulunamadı. Önce kayıt olmanız gerekiyor.');
      }
    } catch (err) {
      haptics.error();
      const errorCode = err instanceof ApiError ? err.code : undefined;
      setError(
        errorCode === 'mismatch'
          ? 'Kod hatalı, tekrar deneyin.'
          : errorCode === 'expired'
            ? 'Kodun süresi doldu, yeni kod isteyin.'
            : errorCode === 'max_attempts'
              ? 'Çok fazla yanlış deneme yapıldı, yeni kod isteyin.'
              : 'Doğrulama başarısız, lütfen tekrar deneyin.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      {/* Lacivert bloğun üstünde saat ve pil beyaz görünsün. */}
      <StatusBar style="light" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.lg }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.brand, { paddingTop: insets.top }]}>
            {/* Orijinal Avedon logosu; lacivert zemin için harfleri beyaz sürüm
                (assets/brand, kaynak docs/orijinal-tasarim/logo). */}
            <Image
              source={require('../../../assets/brand/avedon-logo-light.png')}
              style={styles.brandLogo}
              resizeMode="contain"
              accessible
              accessibilityRole="header"
              accessibilityLabel="Avedon"
            />
            <Text style={styles.brandTagline}>Kaliteli kumaş aramanın yenilikçi yolu</Text>
          </View>

          {/* Davet bağlantısıyla gelindiyse kim davet etti (Faz 2, Adım 4). */}
          <InviteBanner />

          <View style={styles.content}>
            <Text style={styles.title}>Giriş Yap</Text>
            <Text style={styles.subtitle}>
              {step === 'phone'
                ? 'Kayıtlı telefon numaranızı girin, size bir doğrulama kodu gönderelim.'
                : `${phone} numarasına gönderilen 6 haneli kodu girin.`}
            </Text>

            {step === 'phone' ? (
              <>
                <Text style={styles.label} nativeID="phoneLabel">
                  Telefon
                </Text>
                <TextInput
                  style={styles.phoneInput}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="05XX XXX XX XX"
                  placeholderTextColor={colors.chevron}
                  keyboardType="phone-pad"
                  // Telefonun otomatik doldurması (denetim FINDING-014).
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  returnKeyType="send"
                  onSubmitEditing={() => phone.trim().length >= 10 && !submitting && sendCode()}
                  accessibilityLabel="Telefon"
                  accessibilityLabelledBy="phoneLabel"
                />
              </>
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
                label={submitting ? 'Gönderiliyor' : 'Kod Gönder'}
                size="lg"
                disabled={submitting || phone.trim().length < 10}
                onPress={sendCode}
                style={styles.primaryAction}
              />
            ) : (
              <PrimaryButton
                label={submitting ? 'Doğrulanıyor' : 'Giriş Yap'}
                size="lg"
                disabled={submitting || code.trim().length !== 6}
                onPress={handleVerify}
                style={styles.primaryAction}
              />
            )}

            <PrimaryButton
              label="Hesabım Yok, Kayıt Ol"
              variant="outline"
              size="lg"
              onPress={() => navigation.replace('RoleSelection')}
              style={styles.secondaryAction}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  brand: {
    minHeight: 280,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingBottom: 28,
    justifyContent: 'flex-end',
  },
  // Logo dosyası 900x145 → 280x45. Yüzde genişlik + aspectRatio web'de
  // uygulanmadı (tarayıcıda kutu 280x145 ölçüldü, logonun üstü/altı boştu).
  brandLogo: { width: 280, height: 45, maxWidth: '100%' },
  brandTagline: { ...typography.body, color: colors.onPrimaryMuted, marginTop: spacing.sm },
  content: { paddingHorizontal: spacing.lg, paddingTop: 28 },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: 6 },
  label: { ...typography.label, fontFamily: fonts.semibold, color: colors.text, marginTop: spacing.lg, marginBottom: 6 },
  phoneInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.gutter,
    fontFamily: fonts.mono,
    fontSize: 17,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  error: { ...typography.label, fontFamily: fonts.regular, color: colors.danger, marginTop: spacing.md },
  primaryAction: { marginTop: spacing.md },
  secondaryAction: { marginTop: spacing.sm },
});
