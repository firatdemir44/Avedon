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

/**
 * Benzer kumaş araması (Faz 3, Adım 3) için tek fotoğraf: ürün fotoğraflarıyla
 * aynı sıkıştırma yardımcısı, ama küçültme UZUN KENARA göre yapılır (dikey
 * çekilen kumaş fotoğrafında yalnızca genişliği kısmak dosyayı küçültmüyor).
 * Sonuç sunucunun karakter sınırını aşarsa kademeli olarak daha da küçültülür;
 * en küçüğü de sığmazsa `image_too_large` fırlatır.
 */
export async function pickLookPhoto(
  source: 'camera' | 'gallery',
  maxChars: number
): Promise<CompressedImage | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('camera_permission_denied');
  } else {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error('permission_denied');
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'] })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];

  // İlk deneme ürün fotoğrafıyla aynı: uzun kenar ~1000 px, JPEG ~%60.
  for (const [maxSide, compress] of [
    [1000, 0.6],
    [800, 0.5],
    [640, 0.4],
  ] as const) {
    const image = await shrink(asset, maxSide, compress, true);
    if (image && image.dataUrl.length <= maxChars) return image;
  }
  throw new Error('image_too_large');
}

/**
 * Kişisel profil fotoğrafı: kare kırpma (allowsEditing + aspect 1:1), 512 px ve
 * JPEG ~%70. Sonuç sunucunun karakter sınırını aşarsa kademeli olarak daha da
 * küçültülür; en küçüğü de sığmazsa `image_too_large` fırlatır.
 */
export async function pickAvatarPhoto(
  source: 'camera' | 'gallery',
  maxChars: number
): Promise<CompressedImage | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('camera_permission_denied');
  } else {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error('permission_denied');
  }

  // Kare kırpma penceresi: web'de expo-image-picker bunu desteklemiyor, orada
  // sessizce atlanır ve fotoğraf olduğu gibi gelir (avatar zaten "cover").
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];

  for (const [maxSide, compress] of [
    [512, 0.7],
    [384, 0.6],
    [256, 0.5],
  ] as const) {
    const image = await shrink(asset, maxSide, compress, true);
    if (image && image.dataUrl.length <= maxChars) return image;
  }
  throw new Error('image_too_large');
}

/**
 * Elde hazır duran bir fotoğrafı (data URL) ürün fotoğrafı sınırına sığdırır:
 * WhatsApp taslağından gelen etiket fotoğrafı sunucuda kendi sınırıyla
 * saklanıyor, ürün fotoğrafı sınırı daha dar olabiliyor. Zaten sığıyorsa
 * dokunulmaz. Küçültme başarısız olursa (bazı ortamlarda data URL okunamaz)
 * null döner — çağıran fotoğrafı eklemez.
 */
export async function fitDataUrl(dataUrl: string, maxChars: number): Promise<CompressedImage | null> {
  if (dataUrl.length <= maxChars) return { uri: dataUrl, dataUrl };
  for (const [maxSide, compress] of [
    [1000, 0.6],
    [800, 0.5],
    [640, 0.4],
  ] as const) {
    try {
      const manipulated = await ImageManipulator.manipulateAsync(dataUrl, [{ resize: { width: maxSide } }], {
        compress,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      });
      if (!manipulated.base64) continue;
      const next = `data:image/jpeg;base64,${manipulated.base64}`;
      if (next.length <= maxChars) return { uri: manipulated.uri, dataUrl: next };
    } catch {
      return null;
    }
  }
  return null;
}

async function shrink(
  asset: ImagePicker.ImagePickerAsset,
  maxWidth: number,
  compress: number,
  // true: sınır uzun kenara uygulanır (dikey fotoğrafta yüksekliğe).
  longEdge = false
): Promise<CompressedImage | null> {
  const actions: ImageManipulator.Action[] = [];
  if (longEdge && asset.height && asset.height > asset.width && asset.height > maxWidth) {
    actions.push({ resize: { height: maxWidth } });
  } else if (asset.width && asset.width > maxWidth) {
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
