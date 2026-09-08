import React, { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { TextField } from '../../components/TextField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useSession } from '../../context/SessionContext';
import { createSampleRequest } from '../../api/client';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SampleRequestForm'>;

export function SampleRequestFormScreen({ route, navigation }: Props) {
  const { productId, productCode } = route.params;
  const { user } = useSession();
  const [deliveryPreference, setDeliveryPreference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!user || !deliveryPreference.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createSampleRequest({
        productId,
        requesterId: user.id,
        deliveryPreference: deliveryPreference.trim(),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Talep gönderilemedi');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Text style={styles.successTitle}>Numune talebiniz alındı</Text>
        <Text style={styles.successText}>{productCode} için talebiniz iletildi. Durumu "Taleplerim" ekranından takip edebilirsiniz.</Text>
        <PrimaryButton label="Taleplerime Git" onPress={() => navigation.replace('MySampleRequests')} style={{ marginTop: spacing.lg }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <Text style={styles.title}>{productCode} için numune talebi</Text>
      <TextField
        label="Teslimat Tercihi"
        value={deliveryPreference}
        onChangeText={setDeliveryPreference}
        placeholder="Örn. Kargo ile İstanbul ofisimize"
        multiline
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton
        label={submitting ? 'Gönderiliyor...' : 'Talebi Gönder'}
        disabled={submitting || !deliveryPreference.trim()}
        onPress={handleSubmit}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: spacing.lg },
  error: { fontSize: 13, color: colors.danger, marginBottom: spacing.md },
  successTitle: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  successText: { fontSize: 15, color: colors.textMuted },
});
