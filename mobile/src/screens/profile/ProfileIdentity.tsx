import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { PublicUserProfile } from '../../api/client';
import { colors, spacing } from '../../theme';

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
  name: { fontSize: 24, fontWeight: '700', color: colors.text },
  position: { fontSize: 15, color: colors.textMuted, marginTop: spacing.xs },
  companyLink: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
    marginTop: spacing.sm,
  },
  row: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  rowLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 2,
  },
  rowValue: { fontSize: 15, color: colors.text },
  rowValuePlaceholder: { fontSize: 14, color: colors.textMuted, fontStyle: 'italic' },
});
