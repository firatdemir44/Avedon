// Kayıt 3. adım: kişisel bilgiler (yeni tasarım, 4. adım).
// Veri katmanı aynı: taslak güncellenir, bireysel hesapta doğrulamaya,
// diğerlerinde firma bilgilerine gidilir. Görünüm `ui/Input` + yapışkan düğme.
import React from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { OnboardingLayout } from '../../components/OnboardingLayout';
import { useRegistration } from '../../context/RegistrationContext';
import { tr } from '../../i18n';
import { useTheme } from '../../theme/ThemeContext';
import { Button, Input } from '../../ui';

type Props = NativeStackScreenProps<RootStackParamList, 'PersonalInfo'>;

export function PersonalInfoScreen({ navigation }: Props) {
  const t = useTheme();
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
    <OnboardingLayout
      step={3}
      totalSteps={6}
      title={tr('Kişisel bilgileriniz')}
      subtitle={tr('Doğrulama kodunu bu numaraya göndereceğiz.')}
      footer={<Button size="lg" label={tr('Devam Et')} disabled={!canContinue} onPress={handleContinue} />}
    >
      <View style={{ gap: t.space[4], minWidth: 0 }}>
        <Input
          label={tr('Ad')}
          value={draft.firstName}
          onChangeText={(firstName) => updateDraft({ firstName })}
          placeholder={tr('Adınız')}
          autoComplete="given-name"
          textContentType="givenName"
        />
        <Input
          label={tr('Soyad')}
          value={draft.lastName}
          onChangeText={(lastName) => updateDraft({ lastName })}
          placeholder={tr('Soyadınız')}
          autoComplete="family-name"
          textContentType="familyName"
        />
        <Input
          label={tr('Telefon')}
          value={draft.phone}
          onChangeText={(phone) => updateDraft({ phone })}
          placeholder="05XX XXX XX XX"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
        />
      </View>
    </OnboardingLayout>
  );
}
