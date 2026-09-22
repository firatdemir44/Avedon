import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { SearchBox } from '../ui';

// Geriye dönük sarmalayıcı: içi ui/SearchBox (DESIGN.md §2: 48px, surface-1,
// line-strong kenarlık). Ürünler, Mesajlar ve GlobalSearch ortak kullanır.
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
    <SearchBox
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      accessibilityLabel={accessibilityLabel}
      autoFocus={autoFocus}
      onSubmitEditing={onSubmitEditing}
      style={style}
    />
  );
}
