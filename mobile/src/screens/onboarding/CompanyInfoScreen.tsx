// Kayıt 4. adım: firma bilgileri (yeni tasarım, 4. adım).
// Veri katmanı aynı: taslak güncellenir, "Devam Et" PhoneVerification'a gider.
import React from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { OnboardingLayout } from '../../components/OnboardingLayout';
import { useRegistration } from '../../context/RegistrationContext';
import { useTheme } from '../../theme/ThemeContext';
import { Button, Input } from '../../ui';

type Props = NativeStackScreenProps<RootStackParamList, 'CompanyInfo'>;

export function CompanyInfoScreen({ navigation }: Props) {
  const t = useTheme();
  const { draft, updateDraft } = useRegistration();

  const canContinue = draft.companyName.trim().length > 0 && draft.taxId.trim().length > 0;

  return (
    <OnboardingLayout
      step={4}
      totalSteps={6}
      title="Firma bilgileri"
      subtitle="Vergi numarası, temel belge kontrolüyle birlikte doğrulanmış rozeti almanız için kullanılır."
      footer={
        <Button
          size="lg"
          label="Devam Et"
          disabled={!canContinue}
          onPress={() => navigation.navigate('PhoneVerification')}
        />
      }
    >
      <View style={{ gap: t.space[4], minWidth: 0 }}>
        <Input
          label="Firma adı"
          value={draft.companyName}
          onChangeText={(companyName) => updateDraft({ companyName })}
          placeholder="Firma unvanı"
        />
        <Input
          label="Vergi numarası"
          value={draft.taxId}
          onChangeText={(taxId) => updateDraft({ taxId })}
          placeholder="Vergi no"
          keyboardType="number-pad"
          inputMode="numeric"
          helper="Yalnızca doğrulama için kullanılır, profilinizde görünmez."
        />
      </View>
    </OnboardingLayout>
  );
}
