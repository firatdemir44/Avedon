// "Deneyim" bölümü (yeni tasarım, 4. adım — DESIGN.md §3 "Kart" + §5).
// Süre istemcide hesaplanır (features/users/experienceDates).
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import type { UserExperience } from '../../api/client';
import { formatExperiencePeriod } from '../../features/users/experienceDates';
import { tr } from '../../i18n';
import { useTheme } from '../../theme/ThemeContext';
import { Button, Icon, SectionTitle } from '../../ui';

interface Props {
  experiences: UserExperience[];
  // Kendi profilim: başlıkta "Ekle" ve her satırda düzenleme düğmesi.
  isSelf?: boolean;
  onAdd?: () => void;
  onEdit?: (experience: UserExperience) => void;
}

export function ExperienceSection({ experiences, isSelf = false, onAdd, onEdit }: Props) {
  const t = useTheme();
  if (!experiences.length && !isSelf) return null;

  return (
    <View style={{ gap: t.space[3], minWidth: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minWidth: 0 }}>
        <SectionTitle style={{ flex: 1 }} title={tr('Deneyim')} />
        {/* "+" sessiz düğme: ekranın tek dolu düğmesini harcamıyor. */}
        {isSelf && onAdd ? <Button kind="quiet" icon="plus" label={tr('Ekle')} onPress={onAdd} /> : null}
      </View>

      <View
        style={{
          backgroundColor: t.colors.surface1,
          borderWidth: 1,
          borderColor: t.colors.line,
          borderRadius: t.radius.lg,
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
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
          <Text style={[t.type.body14, { color: t.colors.ink2, padding: t.space[4] }]}>
            {tr('Henüz deneyim eklenmedi.')}
          </Text>
        )}
      </View>
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
  const t = useTheme();
  const [expanded, setExpanded] = useState(false);
  const description = experience.description?.trim() ?? '';
  const location = experience.location?.trim() ?? '';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: t.space[2],
        padding: t.space[4],
        borderBottomWidth: divider ? 1 : 0,
        borderBottomColor: t.colors.line,
        minWidth: 0,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: t.space[1] / 2 }}>
        <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>{experience.title}</Text>
        <Text style={[t.type.body16, { color: t.colors.ink }]}>{experience.company}</Text>
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{formatExperiencePeriod(experience)}</Text>
        {location ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{location}</Text> : null}
        {description ? (
          <>
            <Text
              numberOfLines={expanded ? undefined : 2}
              style={[t.type.body16, { color: t.colors.ink, marginTop: t.space[1] }]}
            >
              {description}
            </Text>
            {/* İç içe buton olmasın diye satırın kendisi basılabilir değil. */}
            <Pressable
              onPress={() => setExpanded((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel={expanded ? tr('Açıklamayı kısalt') : tr('Açıklamanın devamını gör')}
              style={({ pressed }) => ({
                alignSelf: 'flex-start',
                minHeight: t.size.touchMin,
                justifyContent: 'center',
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={[t.type.label14, { color: t.colors.brand }]}>
                {expanded ? tr('daha az') : tr('daha fazla')}
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>
      {onEdit ? (
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={tr('{title} deneyimini düzenle', { title: experience.title })}
          style={({ pressed }) => ({
            width: t.size.touchMin,
            height: t.size.touchMin,
            borderRadius: t.radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? t.colors.surface2 : 'transparent',
          })}
        >
          <Icon name="create-outline" size={t.size.iconSm} color="brand" />
        </Pressable>
      ) : null}
    </View>
  );
}
