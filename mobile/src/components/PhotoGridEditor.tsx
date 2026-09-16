import React from 'react';
import { View, Text, Image, Pressable, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '../features/haptics';
import { colors, fonts, radius, spacing, typography } from '../theme';

// Düzenleme ekranlarındaki fotoğraf ızgarası: ekle, kaldır, başa al.
// existing: sunucudaki fotoğrafın eski sırası (kaydederken yeniden yüklenmez),
// dataUrl: yeni seçilen fotoğraf.
export interface EditablePhoto {
  key: string;
  uri: string | null;
  dataUrl: string | null;
  existing?: number;
}

interface Props {
  photos: EditablePhoto[];
  max: number;
  busy?: boolean;
  onAdd: () => void;
  onRemove: (key: string) => void;
  onMoveFirst: (key: string) => void;
  // "Kapak" (ürün) ya da "İlk sırada" (firma galerisi) gibi.
  firstBadge?: string;
  size?: number;
}

export function PhotoGridEditor({
  photos,
  max,
  busy,
  onAdd,
  onRemove,
  onMoveFirst,
  firstBadge,
  size = 96,
}: Props) {
  return (
    <View style={styles.grid}>
      {photos.map((photo, index) => (
        <View key={photo.key} style={{ width: size, height: size }}>
          <Pressable
            onPress={() => {
              if (index === 0) return;
              haptics.selection();
              onMoveFirst(photo.key);
            }}
            disabled={index === 0}
            // Kaldır düğmesiyle kardeş (iç içe değil): web'de iç içe <button> olmasın.
            accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
            accessibilityLabel={
              index === 0
                ? `Fotoğraf ${index + 1}${firstBadge ? `, ${firstBadge.toLocaleLowerCase('tr-TR')}` : ''}`
                : `Fotoğraf ${index + 1}, başa al`
            }
            style={({ pressed }) => [styles.press, pressed && styles.pressed]}
          >
            {photo.uri ? (
              <Image source={{ uri: photo.uri }} style={[styles.photo, { width: size, height: size }]} />
            ) : (
              <View style={[styles.photo, styles.loading, { width: size, height: size }]}>
                <ActivityIndicator color={colors.chevron} />
              </View>
            )}
          </Pressable>
          {index === 0 && firstBadge ? (
            <View style={styles.badge} pointerEvents="none">
              <Text style={styles.badgeText}>{firstBadge}</Text>
            </View>
          ) : null}
          <Pressable
            onPress={() => {
              haptics.selection();
              onRemove(photo.key);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Fotoğraf ${index + 1}, kaldır`}
            style={({ pressed }) => [styles.remove, pressed && styles.removePressed]}
          >
            <Ionicons name="close" size={16} color={colors.primaryText} />
          </Pressable>
        </View>
      ))}
      {photos.length < max ? (
        <Pressable
          onPress={onAdd}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Fotoğraf ekle"
          style={({ pressed }) => [styles.addTile, { width: size, height: size }, pressed && styles.pressed]}
        >
          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Ionicons name="add" size={26} color={colors.primary} />
              <Text style={styles.addText}>Fotoğraf</Text>
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  press: { borderRadius: radius.md, overflow: 'hidden' },
  pressed: { opacity: 0.8 },
  photo: { borderRadius: radius.md, backgroundColor: colors.surfaceTonal },
  loading: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.primaryText },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(17,26,34,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePressed: { backgroundColor: colors.danger },
  addTile: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addText: { ...typography.label, fontFamily: fonts.semibold, color: colors.primary },
});
