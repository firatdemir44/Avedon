// Arama kutusu (DESIGN.md §2): banta gömülmez, `main` içinde 48px ayrı alan —
// surface-1 zemin, 1px line-strong kenarlık, radius-md, solda 20px arama ikonu.
// `onPress` verilirse yazılamaz, yalnızca dokunulabilir bir kutu olur
// (ana sayfadaki "GlobalSearch'ü aç" kutusu gibi).
import React from 'react';
import { Pressable, TextInput, View, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from './Icon';

export interface SearchBoxProps {
  placeholder: string;
  value?: string;
  onChangeText?: (value: string) => void;
  /** Verilirse kutu yazı alanı değil, dokunulabilir bir düğme olur. */
  onPress?: () => void;
  onSubmitEditing?: () => void;
  accessibilityLabel?: string;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SearchBox({
  placeholder,
  value,
  onChangeText,
  onPress,
  onSubmitEditing,
  accessibilityLabel,
  autoFocus,
  style,
  testID,
}: SearchBoxProps) {
  const t = useTheme();

  const box: ViewStyle = {
    minHeight: t.size.control,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space[2],
    paddingHorizontal: t.space[3],
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.lineStrong,
    backgroundColor: t.colors.surface1,
    minWidth: 0,
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="search"
        accessibilityLabel={accessibilityLabel ?? placeholder}
        testID={testID}
        style={({ pressed }) => [box, pressed && { backgroundColor: t.colors.surface2 }, style]}
      >
        <Icon name="search" size={t.size.iconSm} color="ink3" />
        <Text numberOfLines={1} style={[t.type.body16, { color: t.colors.ink3, flex: 1, minWidth: 0 }]}>
          {placeholder}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={[box, style]} testID={testID}>
      <Icon name="search" size={t.size.iconSm} color="ink3" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={t.colors.ink3}
        accessibilityLabel={accessibilityLabel ?? placeholder}
        autoFocus={autoFocus}
        returnKeyType="search"
        style={[
          t.type.body16,
          { color: t.colors.ink, flex: 1, minWidth: 0, paddingVertical: 0, minHeight: t.size.control },
        ]}
      />
      {value ? (
        <Pressable
          onPress={() => onChangeText?.('')}
          accessibilityRole="button"
          accessibilityLabel="Aramayı temizle"
          hitSlop={t.space[2]}
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          <Icon name="x" size={t.size.iconSm} color="ink3" />
        </Pressable>
      ) : null}
    </View>
  );
}
