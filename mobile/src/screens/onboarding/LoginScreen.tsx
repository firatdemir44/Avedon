// Giriş ekranı (yeni tasarım, 4. adım).
// Üstte kenardan kenara marka bloğu (`surfaceBrand`), altında `surface0`
// zeminde başlık, telefon / kod alanı ve düğmeler. Veri katmanı aynı: kod
// isteme, doğrulama, oturum açma. Ham hex / ham px yok; ölçüler token'dan.
import { TakyonMark } from '../../ui/TakyonMark';
import React, { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Image, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { OtpCodeField } from '../../components/OtpCodeField';
import { InviteBanner } from '../../components/InviteBanner';
import { useSession } from '../../context/SessionContext';
import { ApiError, requestOtp, verifyOtp } from '../../api/client';
import { haptics } from '../../features/haptics';
import { tr } from '../../i18n';
import { useTheme } from '../../theme/ThemeContext';
import { Button, Icon, Input } from '../../ui';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

// Logo dosyası 900×145; yüksekliği token'dan alıp genişliği orandan
// hesaplıyoruz (web'de aspectRatio uygulanmıyordu).

export function LoginScreen({ navigation, route }: Props) {
  const t = useTheme();
  const { login } = useSession();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState(route.params?.phone ?? '');
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
        setError(tr('Kod gönderilemedi, lütfen tekrar deneyin.'));
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
        setError(tr('Kod gönderilemedi, lütfen tekrar deneyin.'));
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
        setError(tr('Bu telefon numarasıyla kayıtlı hesap bulunamadı. Önce kayıt olmanız gerekiyor.'));
      }
    } catch (err) {
      haptics.error();
      const errorCode = err instanceof ApiError ? err.code : undefined;
      setError(
        errorCode === 'mismatch'
          ? tr('Kod hatalı, tekrar deneyin.')
          : errorCode === 'expired'
            ? tr('Kodun süresi doldu, yeni kod isteyin.')
            : errorCode === 'max_attempts'
              ? tr('Çok fazla yanlış deneme yapıldı, yeni kod isteyin.')
              : tr('Doğrulama başarısız, lütfen tekrar deneyin.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const logoHeight = t.size.touchMin;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      {/* Lacivert bloğun üstünde saat ve pil beyaz görünsün. */}
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + t.space[10] }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Marka bloğu kenardan kenara; içerideki metin yine 480'e ortalanır. */}
          <View
            style={{
              backgroundColor: t.colors.surfaceBrand,
              paddingTop: insets.top + t.space[10],
              paddingBottom: t.space[8],
              paddingHorizontal: t.space[4],
            }}
          >
            <View style={{ width: '100%', maxWidth: t.size.maxContentWidth, alignSelf: 'center' }}>
              {/* Takyon logosu: girdap işareti + aralıklı büyük harf yazı (logo kartındaki gibi).
                  Eski Avedon yazılı görsel kaldırıldı; net logo dosyası gelince görselle değişecek. */}
              <View accessible accessibilityRole="header" accessibilityLabel="Takyon Texflow" style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                <TakyonMark size={logoHeight} />
                <View>
                  <Text style={[t.type.display28, { color: t.colors.onBrand, letterSpacing: t.space[2] }]}>TAKYON</Text>
                  {/* Ürün adı (Fırat 2026-09-25): Takyon ana şirket, bu uygulama Texflow. */}
                  <Text style={[t.type.label14, { color: t.colors.onBrand, letterSpacing: t.space[2] }]}>TEXFLOW</Text>
                </View>
              </View>
              <Text style={[t.type.body16, { color: t.colors.onBrand, marginTop: t.space[2] }]}>
                {tr('Kaliteli kumaş aramanın yenilikçi yolu')}
              </Text>
            </View>
          </View>

          {/* Davet bağlantısıyla gelindiyse kim davet etti (Faz 2, Adım 4). */}
          <InviteBanner />

          <View
            style={{
              width: '100%',
              maxWidth: t.size.maxContentWidth,
              alignSelf: 'center',
              minWidth: 0,
              paddingHorizontal: t.space[4],
              paddingTop: t.space[6],
              gap: t.space[4],
            }}
          >
            <View style={{ gap: t.space[2], minWidth: 0 }}>
              <Text style={[t.type.title22, { color: t.colors.ink }]}>{tr('Giriş yap')}</Text>
              <Text style={[t.type.body16, { color: t.colors.ink2 }]}>
                {step === 'phone'
                  ? tr('Kayıtlı telefon numaranızı girin, size bir doğrulama kodu gönderelim.')
                  : tr('{phone} numarasına gönderilen 6 haneli kodu girin.', { phone })}
              </Text>
            </View>

            {step === 'phone' ? (
              <Input
                label={tr('Telefon')}
                value={phone}
                onChangeText={setPhone}
                placeholder="05XX XXX XX XX"
                keyboardType="phone-pad"
                // Telefonun otomatik doldurması (denetim FINDING-014).
                autoComplete="tel"
                textContentType="telephoneNumber"
                returnKeyType="send"
                onSubmitEditing={() => phone.trim().length >= 10 && !submitting && sendCode()}
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

            {/* Ekrandaki tek dolu düğme. */}
            {step === 'phone' ? (
              <Button
                size="lg"
                label={tr('Kod gönder')}
                loading={submitting}
                disabled={phone.trim().length < 10}
                onPress={sendCode}
              />
            ) : (
              <Button
                size="lg"
                label={tr('Giriş yap')}
                loading={submitting}
                disabled={code.trim().length !== 6}
                onPress={handleVerify}
              />
            )}

            <Button
              kind="secondary"
              size="lg"
              label={tr('Hesabım yok, kayıt ol')}
              onPress={() => navigation.replace('RoleSelection')}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
