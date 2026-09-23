// Ürün kartı (DESIGN.md §3): sol 72px görsel, ad body-16-strong, kod mono-14,
// özellik satırı body-14 ink-2, firma body-14 ink-3 + doğrulanmış rozeti, sağda chevron.
import React from 'react';
import { Image, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from './Icon';
import { Badge } from './Badge';

export interface ProductCardProps {
  name: string;
  /** Ürün kodu (mono-14). */
  code?: string;
  /** "165 gr/m² · 160 cm · %94 PES %6 EA" gibi tek satır özet. */
  specs?: string;
  companyName?: string;
  companyVerified?: boolean;
  imageUri?: string | null;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ProductCard({
  name,
  code,
  specs,
  companyName,
  companyVerified,
  imageUri,
  onPress,
  style,
  testID,
}: ProductCardProps) {
  const t = useTheme();

  const thumb = (
    <View
      style={{
        width: t.size.thumb,
        height: t.size.thumb,
        borderRadius: t.radius.sm,
        borderWidth: 1,
        borderColor: t.colors.line,
        backgroundColor: t.colors.surface2,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {imageUri ? (
        <Image source={{ uri: imageUri }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
      ) : (
        <Icon name="fabric" color="ink3" />
      )}
    </View>
  );

  const content = (
    <>
      {thumb}
      <View style={{ flex: 1, minWidth: 0, gap: t.space[1] / 2 }}>
        <Text numberOfLines={2} style={[t.type.body16Strong, { color: t.colors.ink }]}>
          {name}
        </Text>
        {code ? (
          <Text numberOfLines={1} style={[t.type.mono14, { color: t.colors.ink2 }]}>
            {code}
          </Text>
        ) : null}
        {specs ? (
          <Text numberOfLines={2} style={[t.type.body14, { color: t.colors.ink2 }]}>
            {specs}
          </Text>
        ) : null}
        {companyName ? (
          // Firma adı kısaltılmaz (satır kırar); rozet bir alt satırda.
          <View style={{ gap: t.space[1], alignItems: 'flex-start', minWidth: 0 }}>
            <Text style={[t.type.body14, { color: t.colors.ink3 }]}>{companyName}</Text>
            {companyVerified ? <Badge kind="verified" /> : null}
          </View>
        ) : null}
      </View>
      {onPress ? (
        <View style={{ alignSelf: 'center' }}>
          <Icon name="chevron" color="ink3" />
        </View>
      ) : null}
    </>
  );

  const base: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: t.space[3],
    padding: t.space[4],
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.line,
    backgroundColor: t.colors.surface1,
    minWidth: 0,
  };

  if (!onPress) {
    return (
      <View style={[base, style]} testID={testID}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[name, code, specs, companyName].filter(Boolean).join('. ')}
      testID={testID}
      style={({ pressed }) => [base, { backgroundColor: pressed ? t.colors.surface2 : t.colors.surface1 }, style]}
    >
      {content}
    </Pressable>
  );
}
