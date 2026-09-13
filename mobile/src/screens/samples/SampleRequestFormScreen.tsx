import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackScreenProps } from '../../navigation/types';
import type { DeliveryMode } from '../../types';
import { TextField } from '../../components/TextField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useSession } from '../../context/SessionContext';
import { createSampleRequest } from '../../api/client';
import { colors, radius, spacing } from '../../theme';

type Props = RootStackScreenProps<'SampleRequestForm'>;

// Teslimat, serbest metin yerine iki seçenek: tasarımdaki takip ekranı son adımı
// ("Teslim Edildi" / "Kurye Teslim Aldı") bu seçime göre adlandırıyor.
const OPTIONS: { mode: DeliveryMode; title: string; description: string }[] = [
  {
    mode: 'seller_ships',
    title: 'Satıcı göndersin',
    description: 'Üretici firma numuneyi kargoyla adresinize gönderir.',
  },
  {
    mode: 'customer_courier',
    title: 'Kendi kuryemle alayım',
    description: 'Numune hazır olunca sizin kuryeniz üreticiden teslim alır.',
  },
];

export function SampleRequestFormScreen({ route, navigation }: Props) {
  const { productId, productCode } = route.params;
  const { user } = useSession();
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!user || !deliveryMode) return;
    setSubmitting(true);
    setError(null);
    try {
      const { sampleRequest } = await createSampleRequest({
        productId,
        deliveryMode,
        note: note.trim() || undefined,
      });
      // Talep sonrası doğrudan takibe: "gönderildi" ekranı bir adım fazlaydı ve
      // kullanıcıyı takip ekranını aramak zorunda bırakıyordu. replace, geri
      // tuşunun doldurulmuş forma dönmesini de engelliyor.
      navigation.replace('SampleRequestTracking', { sampleRequestId: sampleRequest.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Talep gönderilemedi');
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{productCode} için numune talebi</Text>
        <Text style={styles.sectionLabel}>Numuneyi nasıl almak istersiniz?</Text>

        {OPTIONS.map((option) => {
          const selected = deliveryMode === option.mode;
          return (
            <Pressable
              key={option.mode}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => setDeliveryMode(option.mode)}
            >
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected ? <View style={styles.radioInner} /> : null}
              </View>
              <View style={styles.optionText}>
                <Text style={[styles.optionTitle, selected && styles.optionTitleSelected]}>
                  {option.title}
                </Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </View>
            </Pressable>
          );
        })}

        <TextField
          label="Not (isteğe bağlı)"
          value={note}
          onChangeText={setNote}
          placeholder="Örn. İstanbul ofisimize, 2 metre yeterli"
          multiline
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton
          label={submitting ? 'Gönderiliyor...' : 'Talebi Gönder'}
          disabled={submitting || !deliveryMode}
          onPress={handleSubmit}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: spacing.lg },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  optionSelected: { borderColor: colors.accent, borderWidth: 2 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioSelected: { borderColor: colors.accent },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  optionText: { flex: 1, marginLeft: spacing.md },
  optionTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  optionTitleSelected: { color: colors.primary },
  optionDescription: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  error: { fontSize: 13, color: colors.danger, marginBottom: spacing.md },
});
