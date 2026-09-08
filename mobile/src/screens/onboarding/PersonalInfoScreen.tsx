import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { OnboardingLayout } from '../../components/OnboardingLayout';
import { PrimaryButton } from '../../components/PrimaryButton';
import { TextField } from '../../components/TextField';
import { useRegistration } from '../../context/RegistrationContext';

type Props = NativeStackScreenProps<RootStackParamList, 'PersonalInfo'>;

export function PersonalInfoScreen({ navigation }: Props) {
  const { draft, updateDraft } = useRegistration();

  const canContinue = draft.firstName.trim().length > 0 && draft.lastName.trim().length > 0 && draft.phone.trim().length >= 10;

  const handleContinue = () => {
    if (draft.accountType === 'bireysel') {
      navigation.navigate('PhoneVerification');
    } else {
      navigation.navigate('CompanyInfo');
    }
  };

  return (
    <OnboardingLayout step={3} totalSteps={6} title="Kişisel bilgileriniz">
      <TextField
        label="Ad"
        value={draft.firstName}
        onChangeText={(firstName) => updateDraft({ firstName })}
        placeholder="Adınız"
      />
      <TextField
        label="Soyad"
        value={draft.lastName}
        onChangeText={(lastName) => updateDraft({ lastName })}
        placeholder="Soyadınız"
      />
      <TextField
        label="Telefon"
        value={draft.phone}
        onChangeText={(phone) => updateDraft({ phone })}
        placeholder="05XX XXX XX XX"
        keyboardType="phone-pad"
      />
      <PrimaryButton label="Devam Et" disabled={!canContinue} onPress={handleContinue} />
    </OnboardingLayout>
  );
}
