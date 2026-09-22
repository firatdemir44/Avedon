import React from 'react';
import { View, Text, Image, Pressable, ActivityIndicator, Platform } from 'react-native';
import { haptics } from '../features/haptics';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../ui';

// Izgara karesi (DESIGN.md'de adı olmayan ekran-içi ölçü): 375 px'te üç kare
// + iki aralık yan yana sığar.
const TILE_SIZE = 96;

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
  size = TILE_SIZE,
}: Props) {
  const t = useTheme();
  const tile = {
    width: size,
    height: size,
    borderRadius: t.radius.sm,
    borderWidth: 1,
    borderColor: t.colors.line,
    backgroundColor: t.colors.surface2,
    overflow: 'hidden' as const,
  };

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
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
            style={({ pressed }) => [tile, pressed && { opacity: 0.8 }]}
          >
            {photo.uri ? (
              <Image source={{ uri: photo.uri }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={t.colors.ink3} />
              </View>
            )}
          </Pressable>
          {index === 0 && firstBadge ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: t.space[1],
                bottom: t.space[1],
                backgroundColor: t.colors.brand,
                borderRadius: t.radius.sm,
                paddingHorizontal: t.space[2],
                minHeight: t.size.badge,
                justifyContent: 'center',
              }}
            >
              <Text style={[t.type.caption12, { color: t.colors.onBrand }]}>
                {firstBadge.toLocaleUpperCase('tr-TR')}
              </Text>
            </View>
          ) : null}
          <Pressable
            onPress={() => {
              haptics.selection();
              onRemove(photo.key);
            }}
            hitSlop={t.space[2]}
            accessibilityRole="button"
            accessibilityLabel={`Fotoğraf ${index + 1}, kaldır`}
            style={({ pressed }) => ({
              position: 'absolute',
              top: t.space[1],
              right: t.space[1],
              width: t.size.avatarSm,
              height: t.size.avatarSm,
              borderRadius: t.radius.full,
              backgroundColor: pressed ? t.colors.danger : t.colors.overlay,
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <Icon name="x" size={t.size.iconSm} color="onBrand" />
          </Pressable>
        </View>
      ))}
      {photos.length < max ? (
        <Pressable
          onPress={onAdd}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Fotoğraf ekle"
          style={({ pressed }) => ({
            width: size,
            height: size,
            borderRadius: t.radius.sm,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: t.colors.lineStrong,
            backgroundColor: pressed ? t.colors.surface2 : t.colors.surface1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: t.space[1],
            opacity: busy ? 0.4 : 1,
          })}
        >
          {busy ? (
            <ActivityIndicator color={t.colors.brand} />
          ) : (
            <>
              <Icon name="plus" color="brand" />
              <Text style={[t.type.label14, { color: t.colors.brand }]}>Fotoğraf</Text>
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}
