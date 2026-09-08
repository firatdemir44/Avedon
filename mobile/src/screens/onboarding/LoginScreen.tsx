import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { TextField } from '../../components/TextField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useSession } from '../../context/SessionContext';
import { loginUser } from '../../api/client';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { setUser } = useSession();
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { user } = await loginUser(phone.trim());
      setUser(user);
      navigation.reset({ index: 0, routes: [{ name: 'ProductList' }] });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(message === 'user_not_found' ? 'Bu telefon numarasıyla kayıtlı hesap bulunamadı.' : 'Giriş yapılamadı');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>Giriş Yap</Text>
        <Text style={styles.subtitle}>Kayıtlı telefon numaranızla giriş yapın.</Text>
        <TextField
          label="Telefon"
          value={phone}
          onChangeText={setPhone}
          placeholder="05XX XXX XX XX"
          keyboardType="phone-pad"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton
          label={submitting ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          disabled={submitting || phone.trim().length < 10}
          onPress={handleLogin}
        />
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
