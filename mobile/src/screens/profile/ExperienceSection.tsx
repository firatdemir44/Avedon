import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { UserExperience } from '../../api/client';
import { formatExperiencePeriod } from '../../features/users/experienceDates';
import { colors, radius, spacing, typography } from '../../theme';

interface Props {
  experiences: UserExperience[];
  // Kendi profilim: başlıkta "+" ve her satırda kalem.
  isSelf?: boolean;
  onAdd?: () => void;
  onEdit?: (experience: UserExperience) => void;
}

// LinkedIn benzeri "Deneyim" bölümü (Fırat, 2026-09-22). Süre istemcide
// hesaplanır (features/users/experienceDates).
export function ExperienceSection({ experiences, isSelf = false, onAdd, onEdit }: Props) {
  if (!experiences.length && !isSelf) return null;

  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Deneyim
        </Text>
        {isSelf && onAdd ? (
          <Pressable
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel="Deneyim ekle"
            hitSlop={8}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressedFade]}
          >
            <Ionicons name="add" size={20} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>

      {experiences.length ? (
        experiences.map((exp, index) => (
          <ExperienceRow
            key={exp.id}
            experience={exp}
            divider={index < experiences.length - 1}
            onEdit={isSelf && onEdit ? () => onEdit(exp) : undefined}
          />
        ))
      ) : (
        <Text style={styles.empty}>Henüz deneyim eklenmedi.</Text>
      )}
    </View>
  );
}

function ExperienceRow({
  experience,
  divider,
  onEdit,
}: {
  experience: UserExperience;
  divider: boolean;
  onEdit?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const description = experience.description?.trim() ?? '';
  const location = experience.location?.trim() ?? '';

  return (
    <View style={[styles.row, divider && styles.rowDivider]}>
      <View style={styles.rowTexts}>
        <Text style={styles.rowTitle}>{experience.title}</Text>
        <Text style={styles.rowCompany}>{experience.company}</Text>
        <Text style={styles.rowPeriod}>{formatExperiencePeriod(experience)}</Text>
        {location ? <Text style={styles.rowLocation}>{location}</Text> : null}
        {description ? (
          <>
            <Text style={styles.rowDescription} numberOfLines={expanded ? undefined : 2}>
              {description}
            </Text>
            {/* İç içe buton olmasın diye satırın kendisi basılabilir değil. */}
            <Pressable
              onPress={() => setExpanded((value) => !value)}
              accessibilityRole="button"
              hitSlop={6}
              style={({ pressed }) => [styles.moreLink, pressed && styles.pressedFade]}
            >
              <Text style={styles.moreText}>{expanded ? 'daha az' : 'daha fazla'}</Text>
            </Pressable>
          </>
        ) : null}
      </View>
      {onEdit ? (
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`${experience.title} deneyimini düzenle`}
          hitSlop={8}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressedFade]}
        >
          <Ionicons name="pencil" size={18} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.gutter,
    paddingBottom: spacing.sm,
  },
  title: { ...typography.subtitle, color: colors.text, flex: 1, minWidth: 0 },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceTonal,
  },
  pressedFade: { opacity: 0.6 },
  empty: { ...typography.caption, color: colors.textMuted, paddingHorizontal: spacing.gutter, paddingBottom: spacing.gutter },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.gutter,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowTexts: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: { ...typography.bodyStrong, color: colors.text },
  rowCompany: { ...typography.body, color: colors.text },
  rowPeriod: { ...typography.caption, color: colors.textMuted },
  rowLocation: { ...typography.caption, color: colors.textMuted },
  rowDescription: { ...typography.body, color: colors.text, marginTop: spacing.xs },
  moreLink: { alignSelf: 'flex-start', marginTop: 2 },
  moreText: { ...typography.caption, color: colors.accent },
});
