import React from 'react';
import { Modal, View, Image, Pressable, Text, StyleSheet, StatusBar } from 'react-native';
import { fonts } from '../theme';

interface Props {
  imageUrl: string | null;
  visible: boolean;
  onClose: () => void;
}

// Fotoğrafı tam ekran, kırpmadan gösterir. Yakınlaştırma (pinch-zoom) henüz yok:
// gesture-handler bağımlılığı gerektiriyor ve "büyütme" ihtiyacını tam ekran
// zaten karşılıyor — gerekirse buraya eklenir, çağıran taraf değişmez.
export function ImageViewerModal({ imageUrl, visible, onClose }: Props) {
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
      <Pressable style={styles.backdrop} onPress={onClose}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="contain" />
        ) : null}
        <View style={styles.closeButton}>
          <Text style={styles.closeText}>✕</Text>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  closeButton: {
    position: 'absolute',
    top: 48,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#FFFFFF', fontSize: 18, fontFamily: fonts.semibold },
});
