import React from 'react';
import { Modal, View, Image, Pressable, StatusBar } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../ui';

interface Props {
  imageUrl: string | null;
  visible: boolean;
  onClose: () => void;
}

// Fotoğrafı tam ekran, kırpmadan gösterir. Yakınlaştırma (pinch-zoom) henüz yok:
// gesture-handler bağımlılığı gerektiriyor ve "büyütme" ihtiyacını tam ekran
// zaten karşılıyor — gerekirse buraya eklenir, çağıran taraf değişmez.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
export function ImageViewerModal({ imageUrl, visible, onClose }: Props) {
  const t = useTheme();

  return (
    <Modal
      visible={visible && !!imageUrl}
      transparent
      animationType="fade"
      // Android'de donanım geri tuşu da kapatsın.
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" />
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Fotoğrafı kapat"
        style={{
          flex: 1,
          // Tam ekran görsel için koyu örtü: her iki temada da aynı (fotoğraf
          // kendi renginde kalsın diye zemin nötr koyu).
          backgroundColor: t.colors.overlay,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
        ) : null}
        <View
          style={{
            position: 'absolute',
            top: t.space[10],
            right: t.space[5],
            width: t.size.touchMin,
            height: t.size.touchMin,
            borderRadius: t.radius.full,
            backgroundColor: t.colors.surface1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="x" size={t.size.iconSm} color="ink" />
        </View>
      </Pressable>
    </Modal>
  );
}
