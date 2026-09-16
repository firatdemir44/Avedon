import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AssistantPersonaKey, AssistantPersonaOption } from '../api/client';
import { AssistantAvatar } from './AssistantAvatar';
import { colors, fonts, radius, spacing, typography } from '../theme';

// Asistan karakteri seçimi (Faz 1, Adım 9): iki kart yan yana.
// Hem ilk açılışta (Asistan sekmesi) hem de değiştirirken (Firma hafızası)
// aynı kartlar kullanılır. Uygulama cinsiyet sormaz; kullanıcı yüzü seçer.

// Sunucuya ulaşılamazsa gösterilecek liste; adlar backend/src/assistant/persona.ts
// ile aynı kalmalı.
export const FALLBACK_PERSONA_OPTIONS: AssistantPersonaOption[] = [
  { key: 'ipek', name: 'İpek', tagline: 'Atölyeyi de tabloyu da bilir; hızlı, sıcak, net.' },
  { key: 'mert', name: 'Mert', tagline: 'Makine başından masaya; doğrudan, güven veren, pratik.' },
];

export function PersonaPicker({
  options,
  value,
  onSelect,
  busyKey,
  disabled,
  avatarSize = 84,
  style,
}: {
  options: AssistantPersonaOption[];
  // Seçili karakter; henüz seçilmediyse null.
  value: AssistantPersonaKey | null;
  onSelect: (key: AssistantPersonaKey) => void;
  busyKey?: AssistantPersonaKey | null;
  disabled?: boolean;
  avatarSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.row, style]}>
      {options.map((option) => {
        const selected = value === option.key;
        const busy = busyKey === option.key;
        return (
          <Pressable
            key={option.key}
            onPress={() => onSelect(option.key)}
            disabled={disabled || busy}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: disabled || busy }}
            accessibilityLabel={`${option.name}. ${option.tagline}${selected ? ' Seçili.' : ''}`}
            style={({ pressed }) => [
              styles.card,
              selected && styles.cardSelected,
              pressed && !disabled && styles.cardPressed,
            ]}
          >
            <AssistantAvatar persona={option.key} size={avatarSize} state={selected ? 'result' : 'idle'} />
            <View style={styles.nameRow}>
              <Text style={styles.name}>{option.name}</Text>
              {selected ? <Ionicons name="checkmark-circle" size={16} color={colors.assistant} /> : null}
            </View>
            <Text style={styles.tagline}>{option.tagline}</Text>
            {busy ? <ActivityIndicator size="small" color={colors.assistant} style={styles.busy} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  card: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  // Seçili kartın çerçevesi asistan kızılı: asistanın kendisi burada.
  cardSelected: { borderColor: colors.assistant, backgroundColor: colors.assistantSoft },
  cardPressed: { backgroundColor: colors.pressed },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
  name: { ...typography.subtitle, color: colors.text },
  tagline: { ...typography.caption, fontFamily: fonts.regular, color: colors.textMuted, textAlign: 'center' },
  busy: { marginTop: spacing.xs },
});
