// Kayıt 2. adım: pozisyon seçimi (yeni tasarım, 4. adım).
// Veri katmanı aynı: seçim taslağa yazılır, "Devam Et" PersonalInfo'ya gider.
// Görünüm `ui/Chip` (satır kıran sarma düzeni) + yapışkan tek dolu düğme.
import React from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { OnboardingLayout } from '../../components/OnboardingLayout';
import { useRegistration } from '../../context/RegistrationContext';
import { useTheme } from '../../theme/ThemeContext';
import { Button, Chip } from '../../ui';

type Props = NativeStackScreenProps<RootStackParamList, 'Position'>;

const POSITIONS = ['Firma Yetkili Temsilcisi', 'Yönetici / Tasarımcı', 'Satış Sorumlusu', 'Diğer'];

export function PositionScreen({ navigation }: Props) {
  const t = useTheme();
  const { draft, updateDraft } = useRegistration();

  return (
    <OnboardingLayout
      step={2}
      totalSteps={6}
      title="Pozisyonunuz nedir?"
      subtitle="Size uygun olanı seçin."
      footer={
        <Button
          size="lg"
          label="Devam Et"
          disabled={!draft.position}
          onPress={() => navigation.navigate('PersonalInfo')}
        />
      }
    >
      {/* ChipRow yatay kaydırır; buradaki etiketler uzun olduğu için satır kıran
          sarma düzeni kullanılıyor (DESIGN.md §3 çip ölçüleri korunuyor). */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2], minWidth: 0 }}>
        {POSITIONS.map((position) => (
          <Chip
            key={position}
            label={position}
            selected={draft.position === position}
            onPress={() => updateDraft({ position })}
            // Dokunma hedefi 44px'in altına inmesin.
            style={{ minHeight: t.size.touchMin }}
          />
        ))}
      </View>
    </OnboardingLayout>
  );
}
