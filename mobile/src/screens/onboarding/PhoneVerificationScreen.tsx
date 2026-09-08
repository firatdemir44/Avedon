import React, { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { OnboardingLayout } from '../../components/OnboardingLayout';
import { PrimaryButton } from '../../components/PrimaryButton';
import { TextField } from '../../components/TextField';
import { useRegistration } from '../../context/RegistrationContext';
import { useSession } from '../../context/SessionContext';
import { registerUser } from '../../api/client';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PhoneVerification'>;

export function PhoneVerificationScreen({ navigation }: Props) {
  const { draft } = useRegistration();
  const { setUser } = useSession();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    if (draft.accountType !== 'bireysel') {
      navigation.navigate('CompanyCode');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { user } = await registerUser(draft);
      setUser(user);
      navigation.navigate('ProductList');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kayıt tamamlanamadı');
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
      <Text style={styles.hint}>Bu ekranda gerçek SMS gönderimi henüz bağlı değil — herhangi bir 6 haneli kod kabul edilir.</Text>
      <TextField
        label="Doğrulama Kodu"
        value={code}
        onChangeText={setCode}
        placeholder="123456"
        keyboardType="number-pad"
        maxLength={6}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton
        label={submitting ? 'Kaydediliyor...' : 'Doğrula ve Devam Et'}
        disabled={code.trim().length !== 6 || submitting}
        onPress={handleContinue}
      />
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  error: {
    fontSize: 13,
    color: colors.danger,
    marginBottom: spacing.md,
  },
});
