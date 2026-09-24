// Kayıt 1. adım: hesap türü (yeni tasarım, 4. adım).
// Veri katmanı aynı: seçim taslağa yazılır ve Position ekranına gidilir.
// Görünüm `ui/Card` + token'lar; ham hex / ham px yok.
import React from 'react';
import { View, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { OnboardingLayout } from '../../components/OnboardingLayout';
import { InviteBanner } from '../../components/InviteBanner';
import { useRegistration } from '../../context/RegistrationContext';
import { tr } from '../../i18n';
import { useTheme } from '../../theme/ThemeContext';
import { Button, Card } from '../../ui';
import type { AccountType } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'RoleSelection'>;

// Etiketler render anında çevrilsin diye fonksiyon.
const options = (): { value: AccountType; title: string; description: string }[] => [
  {
    value: 'konfeksiyon',
    title: tr('Konfeksiyon / Giyim Üreticisi'),
    description: tr('Kumaş ve numune arıyorum (alıcı taraf)'),
  },
  {
    value: 'uretici',
    title: tr('Kumaş Üreticisi'),
    description: tr('Raschel, örme, dokuma vb. kumaş üretiyorum'),
  },
  {
    value: 'bireysel',
    title: tr('Bireysel'),
    description: tr('Bir firmaya bağlı değilim'),
  },
];

export function RoleSelectionScreen({ navigation }: Props) {
  const t = useTheme();
  const { draft, updateDraft } = useRegistration();

  const handleSelect = (value: AccountType) => {
    updateDraft({ accountType: value });
    navigation.navigate('Position');
  };

  return (
    <OnboardingLayout
      step={1}
      totalSteps={6}
      title={tr('Nasıl katılmak istersiniz?')}
      subtitle={tr('Hesap türünüzü seçin')}
      banner={<InviteBanner />}
    >
      <View style={{ gap: t.space[3], minWidth: 0 }}>
        {options().map((option) => {
          const selected = draft.accountType === option.value;
          return (
            <Card
              key={option.value}
              onPress={() => handleSelect(option.value)}
              accessibilityLabel={`${option.title}. ${option.description}`}
              // Seçili kart yalnızca renkle değil, kenarlık kalınlığıyla da ayrılır.
              style={{
                minHeight: t.size.touchMin,
                borderColor: selected ? t.colors.brand : t.colors.line,
                backgroundColor: selected ? t.colors.brandSoft : t.colors.surface1,
              }}
            >
              <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>{option.title}</Text>
              <Text style={[t.type.body14, { color: t.colors.ink2, marginTop: t.space[1] }]}>
                {option.description}
              </Text>
            </Card>
          );
        })}
      </View>

      {/* Ekranın ana eylemi kart seçimi olduğu için burada dolu düğme yok. */}
      <Button
        kind="quiet"
        fullWidth
        label={tr('Zaten hesabım var, giriş yap')}
        onPress={() => navigation.navigate('Login')}
      />
    </OnboardingLayout>
  );
}
