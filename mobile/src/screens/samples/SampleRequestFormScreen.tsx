// Numune talebi formu (yeni tasarım, 4. adım — DESIGN.md §2/§3).
// Veri katmanı değişmedi: aynı gövde (productId, deliveryMode, note) ile
// POST /sample-requests, başarıda `replace('SampleRequestTracking')`.
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import type { DeliveryMode } from '../../types';
import { useSession } from '../../context/SessionContext';
import { createSampleRequest } from '../../api/client';
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Button, Card, Chip, Icon, Input, Screen, SectionTitle } from '../../ui';

type Props = RootStackScreenProps<'SampleRequestForm'>;

// Teslimat, serbest metin yerine iki seçenek: tasarımdaki takip ekranı son adımı
// ("Teslim Edildi" / "Kurye Teslim Aldı") bu seçime göre adlandırıyor.
const OPTIONS: { mode: DeliveryMode; title: string; description: string }[] = [
  {
    mode: 'seller_ships',
    title: 'Satıcı göndersin',
    description: 'Üretici firma numuneyi kargoyla adresine gönderir.',
  },
  {
    mode: 'customer_courier',
    title: 'Kendi kuryemle alayım',
    description: 'Numune hazır olunca senin kuryen üreticiden teslim alır.',
  },
];

export function SampleRequestFormScreen({ route, navigation }: Props) {
  const { productId, productCode } = route.params;
  const t = useTheme();
  const { user } = useSession();
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

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

  const chosen = OPTIONS.find((o) => o.mode === deliveryMode);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title="Numune talebi" leading="back" onBack={() => navigation.goBack()} />

      <Screen
        sticky={
          <Button
            size="lg"
            label="Talebi gönder"
            loading={submitting}
            disabled={!deliveryMode}
            onPress={handleSubmit}
          />
        }
      >
        {/* Ürün özeti: hangi kumaş için talep açıldığı üstte görünsün. */}
        <Card>
          <View style={{ gap: t.space[1] }}>
            <Text style={[t.type.body14, { color: t.colors.ink2 }]}>Numune istenen ürün</Text>
            <Text style={[t.type.mono20, { color: t.colors.ink }]}>{productCode}</Text>
          </View>
        </Card>

        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="Numuneyi nasıl almak istersin?" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            {OPTIONS.map((option) => (
              <Chip
                key={option.mode}
                label={option.title}
                icon={deliveryMode === option.mode ? 'check' : undefined}
                selected={deliveryMode === option.mode}
                onPress={() => setDeliveryMode(option.mode)}
              />
            ))}
          </View>
          <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
            {chosen ? chosen.description : 'Devam etmek için bir teslim şekli seç.'}
          </Text>
        </View>

        <Input
          label="Not (isteğe bağlı)"
          value={note}
          onChangeText={setNote}
          placeholder="Örn. İstanbul ofisimize, 2 metre yeterli"
          multiline
        />

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
      </Screen>
    </View>
  );
}
