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

type Props = NativeStackScreenProps<RootStackParamList, 'CompanyCode'>;

export function CompanyCodeScreen({ navigation }: Props) {
  const { draft, updateDraft } = useRegistration();
  const { setUser } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
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
      <Text style={styles.hint}>Kayıt tamamlandığında firmanız "{draft.companyName || '—'}" temel doğrulama incelemesine alınacak.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton label={submitting ? 'Kaydediliyor...' : 'Kaydı Tamamla'} disabled={submitting} onPress={handleSubmit} />
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
