import React from 'react';
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { AssistantPersonaKey, AssistantPersonaOption } from '../api/client';
import { AssistantAvatar } from './AssistantAvatar';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../ui';

// Asistan karakteri seçimi (Faz 1, Adım 9): iki kart yan yana.
// Hem ilk açılışta (Asistan sekmesi) hem de değiştirirken (Firma hafızası)
// aynı kartlar kullanılır. Uygulama cinsiyet sormaz; kullanıcı yüzü seçer.
//
// Yeni tasarım (DESIGN.md, 4. adım): kart `surface1` + 1px `line` + `radius.lg`;
// seçili kartta bakır (`accent`) çerçeve — asistanın kendisi burada.

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
  const t = useTheme();
  return (
    <View style={[{ flexDirection: 'row', gap: t.space[3], minWidth: 0 }, style]}>
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
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 0,
              alignItems: 'center',
              gap: t.space[2],
              borderWidth: 1,
              borderRadius: t.radius.lg,
              padding: t.space[3],
              borderColor: selected ? t.colors.accent : t.colors.line,
              backgroundColor: selected
                ? t.colors.accentSoft
                : pressed && !disabled
                  ? t.colors.surface2
                  : t.colors.surface1,
              opacity: disabled && !selected ? 0.4 : 1,
            })}
          >
            <AssistantAvatar persona={option.key} size={avatarSize} state={selected ? 'result' : 'idle'} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[1], minWidth: 0 }}>
              <Text style={[t.type.body16Strong, { color: t.colors.ink }]} numberOfLines={1}>
                {option.name}
              </Text>
              {selected ? <Icon name="checkmark-circle-outline" size={t.size.iconSm} color="accent" /> : null}
            </View>
            <Text style={[t.type.body14, { color: t.colors.ink2, textAlign: 'center' }]}>{option.tagline}</Text>
            {busy ? <ActivityIndicator size="small" color={t.colors.accent} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
