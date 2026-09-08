import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

export interface CompressedImage {
  uri: string;
  dataUrl: string;
}

/**
 * Galeriden fotoğraf seçer ve gönderim öncesi küçültüp sıkıştırır.
 * expo-image-picker'ın `quality` seçeneği web'de etkisiz kalıyor — orijinal
 * boyutta bir fotoğraf (birkaç MB) backend'e gidip isteği tıkayabiliyordu,
 * bu yüzden sıkıştırmayı expo-image-manipulator ile kendimiz yapıyoruz.
 */
export async function pickCompressedImage(maxWidth = 1000, compress = 0.6): Promise<CompressedImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('permission_denied');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
  });
  if (result.canceled || !result.assets[0]) return null;

  const original = result.assets[0];
  const actions: ImageManipulator.Action[] = [];
  if (original.width && original.width > maxWidth) {
    actions.push({ resize: { width: maxWidth } });
  }

  const manipulated = await ImageManipulator.manipulateAsync(original.uri, actions, {
    compress,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });

  if (!manipulated.base64) return null;

  return {
    uri: manipulated.uri,
    dataUrl: `data:image/jpeg;base64,${manipulated.base64}`,
  };
}
