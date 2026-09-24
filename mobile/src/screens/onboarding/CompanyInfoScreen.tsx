// Kayıt 4. adım: firma bilgileri (yeni tasarım, 4. adım).
// Veri katmanı aynı: taslak güncellenir, "Devam Et" PhoneVerification'a gider.
// Vergi numarası isteğe bağlı: elinde olmayan "sonra ekleyeceğim" ile geçer,
// sonradan Firma bilgileri'nden ekler (doğrulama başvurusu için gerekir).
import React from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { OnboardingLayout } from '../../components/OnboardingLayout';
import { useRegistration } from '../../context/RegistrationContext';
import { tr } from '../../i18n';
import { useTheme } from '../../theme/ThemeContext';
import { Button, Input } from '../../ui';
import { taxIdError } from '../../features/companies/validation';

type Props = NativeStackScreenProps<RootStackParamList, 'CompanyInfo'>;

export function CompanyInfoScreen({ navigation }: Props) {
  const t = useTheme();
  const { draft, updateDraft } = useRegistration();

  const taxIdProblem = taxIdError(draft.taxId);
  const canContinue = draft.companyName.trim().length > 0 && !taxIdProblem;

  const skipTaxId = () => {
    updateDraft({ taxId: '' });
    navigation.navigate('PhoneVerification');
  };

  return (
    <OnboardingLayout
      step={4}
      totalSteps={6}
      title={tr('Firma bilgileri')}
      subtitle={tr('Firma adı yeterli. Vergi numarası doğrulanmış rozet için gerekir; şimdi ya da sonra ekleyebilirsiniz.')}
      footer={
        <Button
          size="lg"
          label={tr('Devam Et')}
          disabled={!canContinue}
          onPress={() => navigation.navigate('PhoneVerification')}
        />
      }
    >
      <View style={{ gap: t.space[4], minWidth: 0 }}>
        <Input
          label={tr('Firma adı')}
          value={draft.companyName}
          onChangeText={(companyName) => updateDraft({ companyName })}
          placeholder={tr('Firma unvanı')}
        />
        <Input
          label={tr('Vergi numarası')}
          value={draft.taxId}
          onChangeText={(taxId) => updateDraft({ taxId })}
          placeholder={tr('Vergi no')}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={14}
          helper={tr('Elinizde yoksa boş bırakabilirsiniz; daha sonra Firma bilgileri’nden eklersiniz. Doğrulanmış rozeti için gerekir.')}
          error={draft.taxId.trim() ? taxIdProblem : null}
        />
        <Button
          kind="quiet"
          label={tr('Vergi numarasını sonra ekleyeceğim')}
          disabled={draft.companyName.trim().length === 0}
          onPress={skipTaxId}
        />
      </View>
    </OnboardingLayout>
  );
}
