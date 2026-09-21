import React from 'react';
import { View, TextInput, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MIN_TOUCH, colors, fonts, radius } from '../theme';

// Taslaklardaki arama kutusu (CUrunler, CMesajlar): tonlu zemin, büyüteç ikonu,
// yazı varken temizleme düğmesi. Ürünler ve Mesajlar ortak kullanır.
export function SearchField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  style,
  autoFocus,
  onSubmitEditing,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  // Arama ekranı açılınca klavye hemen gelsin diye (GlobalSearch).
  autoFocus?: boolean;
  // Klavyedeki "ara" tuşu.
  onSubmitEditing?: () => void;
}) {
  return (
    <View style={[styles.field, style]}>
      <Ionicons name="search-outline" size={18} color={colors.textMuted} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        returnKeyType="search"
        autoFocus={autoFocus}
        onSubmitEditing={onSubmitEditing}
        autoCorrect={false}
        accessibilityLabel={accessibilityLabel}
      />
      {value ? (
        <Pressable
          onPress={() => onChangeText('')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Aramayı temizle"
        >
          <Ionicons name="close-circle" size={18} color={colors.chevron} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTonal,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 0,
    minHeight: MIN_TOUCH - 2,
  },
});
