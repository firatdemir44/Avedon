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

  return shrink(result.assets[0], maxWidth, compress);
}

/**
 * Galeriden birden fazla fotoğraf (etiket okuma: en fazla 4). Seçilenlerin
 * hepsi aynı kuralla küçültülür.
 */
export async function pickCompressedImages(
  limit: number,
  maxWidth = 1600,
  compress = 0.7
): Promise<CompressedImage[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('permission_denied');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
  });
  if (result.canceled) return [];

  const images: CompressedImage[] = [];
  for (const asset of result.assets.slice(0, limit)) {
    const image = await shrink(asset, maxWidth, compress);
    if (image) images.push(image);
  }
  return images;
}

/**
 * Kamerayla tek fotoğraf (yalnızca telefon; web'de tarayıcı kamerası yok).
 */
export async function captureCompressedImage(maxWidth = 1600, compress = 0.7): Promise<CompressedImage | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('camera_permission_denied');
  }

  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'] });
  if (result.canceled || !result.assets[0]) return null;

  return shrink(result.assets[0], maxWidth, compress);
}

async function shrink(
  asset: ImagePicker.ImagePickerAsset,
  maxWidth: number,
  compress: number
): Promise<CompressedImage | null> {
  const actions: ImageManipulator.Action[] = [];
  if (asset.width && asset.width > maxWidth) {
    actions.push({ resize: { width: maxWidth } });
  }

  const manipulated = await ImageManipulator.manipulateAsync(asset.uri, actions, {
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
