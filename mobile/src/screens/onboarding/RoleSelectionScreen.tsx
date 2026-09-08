import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { OnboardingLayout } from '../../components/OnboardingLayout';
import { useRegistration } from '../../context/RegistrationContext';
import { colors, radius, spacing } from '../../theme';
import type { AccountType } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'RoleSelection'>;

const OPTIONS: { value: AccountType; title: string; description: string }[] = [
  {
    value: 'konfeksiyon',
    title: 'Konfeksiyon / Giyim Üreticisi',
    description: 'Kumaş ve numune arıyorum (alıcı taraf)',
  },
  {
    value: 'uretici',
    title: 'Kumaş Üreticisi',
    description: 'Raschel, örme, dokuma vb. kumaş üretiyorum',
  },
  {
    value: 'bireysel',
    title: 'Bireysel',
    description: 'Bir firmaya bağlı değilim',
  },
];

export function RoleSelectionScreen({ navigation }: Props) {
  const { draft, updateDraft } = useRegistration();

  const handleSelect = (value: AccountType) => {
    updateDraft({ accountType: value });
    navigation.navigate('Position');
  };

  return (
    <OnboardingLayout step={1} totalSteps={6} title="Nasıl katılmak istersiniz?" subtitle="Hesap türünüzü seçin">
      <View style={styles.list}>
        {OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            onPress={() => handleSelect(option.value)}
            style={[styles.card, draft.accountType === option.value && styles.cardSelected]}
          >
            <Text style={styles.cardTitle}>{option.title}</Text>
            <Text style={styles.cardDescription}>{option.description}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.loginLink} onPress={() => navigation.navigate('Login')}>
        <Text style={styles.loginLinkText}>Zaten hesabım var, giriş yap</Text>
      </Pressable>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  cardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  cardDescription: {
    fontSize: 14,
    color: colors.textMuted,
  },
  loginLink: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  loginLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
});
