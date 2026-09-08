import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { OnboardingLayout } from '../../components/OnboardingLayout';
import { PrimaryButton } from '../../components/PrimaryButton';
import { TextField } from '../../components/TextField';
import { useRegistration } from '../../context/RegistrationContext';

type Props = NativeStackScreenProps<RootStackParamList, 'CompanyInfo'>;

export function CompanyInfoScreen({ navigation }: Props) {
  const { draft, updateDraft } = useRegistration();

  const canContinue = draft.companyName.trim().length > 0 && draft.taxId.trim().length > 0;

  return (
    <OnboardingLayout
      step={4}
      totalSteps={6}
      title="Firma bilgileri"
      subtitle="Vergi numarası, temel belge kontrolüyle birlikte doğrulanmış rozeti almanız için kullanılır"
    >
      <TextField
        label="Firma Adı"
        value={draft.companyName}
        onChangeText={(companyName) => updateDraft({ companyName })}
        placeholder="Firma unvanı"
      />
      <TextField
        label="Vergi Numarası"
        value={draft.taxId}
        onChangeText={(taxId) => updateDraft({ taxId })}
        placeholder="Vergi no"
        keyboardType="number-pad"
      />
      <PrimaryButton label="Devam Et" disabled={!canContinue} onPress={() => navigation.navigate('PhoneVerification')} />
    </OnboardingLayout>
  );
}
