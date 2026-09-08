import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

interface Props {
  imageUrl?: string | null;
  size?: number;
}

export function ProductThumbnail({ imageUrl, size = 76 }: Props) {
  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} style={[styles.image, { width: size, height: size }]} />;
  }
  return (
    <View style={[styles.placeholder, { width: size, height: size }]}>
      <Text style={styles.placeholderText}>Görsel yok</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  placeholder: {
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  placeholderText: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
