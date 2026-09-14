import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { PublicUserProfile } from '../../api/client';
import { colors, fonts, spacing, typography } from '../../theme';

interface Props {
  profile: PublicUserProfile;
  onOpenCompany?: (companyId: string) => void;
}

export function ProfileIdentity({ profile, onOpenCompany }: Props) {
  return (
    <View>
      <Text style={styles.name}>
        {profile.firstName} {profile.lastName}
      </Text>
      <Text style={styles.position}>{profile.position}</Text>

      {profile.company ? (
        <Pressable onPress={() => onOpenCompany?.(profile.company!.id)} disabled={!onOpenCompany}>
          <Text style={styles.companyLink}>{profile.company.name}</Text>
        </Pressable>
      ) : null}

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Telefon</Text>
        {/* Sunucu, bağlantı yoksa telefon alanını hiç göndermiyor. */}
        <Text style={profile.phone ? styles.rowValue : styles.rowValuePlaceholder}>
          {profile.phone ?? 'Bağlantı kurulması gerekmektedir'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  name: { ...typography.title, fontSize: 24, lineHeight: 30, color: colors.primary },
  position: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs },
  companyLink: {
    ...typography.bodyStrong,
    color: colors.accent,
    marginTop: spacing.sm,
  },
  row: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  rowLabel: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    color: colors.textMuted,
    marginBottom: 2,
  },
  rowValue: { ...typography.body, color: colors.text },
  rowValuePlaceholder: { ...typography.body, color: colors.textMuted },
});
