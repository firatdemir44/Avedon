import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { OnboardingLayout } from '../../components/OnboardingLayout';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useRegistration } from '../../context/RegistrationContext';
import { colors, radius, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Position'>;

const POSITIONS = ['Firma Yetkili Temsilcisi', 'Yönetici / Tasarımcı', 'Satış Sorumlusu', 'Diğer'];

export function PositionScreen({ navigation }: Props) {
  const { draft, updateDraft } = useRegistration();

  return (
    <OnboardingLayout step={2} totalSteps={6} title="Pozisyonunuz nedir?">
      <View style={styles.list}>
        {POSITIONS.map((position) => (
          <Pressable
            key={position}
            onPress={() => updateDraft({ position })}
            style={[styles.chip, draft.position === position && styles.chipSelected]}
          >
            <Text style={[styles.chipText, draft.position === position && styles.chipTextSelected]}>
              {position}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={{ marginTop: spacing.lg }}>
        <PrimaryButton
          label="Devam Et"
          disabled={!draft.position}
          onPress={() => navigation.navigate('PersonalInfo')}
        />
      </View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  chipText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: colors.primaryText,
  },
});
