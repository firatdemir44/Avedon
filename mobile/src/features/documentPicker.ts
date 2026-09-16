import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

// Sunucudaki sınır (backend/src/routes/passport.ts MAX_PDF_BASE64_CHARS).
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export interface PickedDocument {
  name: string;
  // data URL ya da çıplak base64; sunucu ikisini de kabul ediyor.
  dataBase64: string;
}

export class DocumentPickError extends Error {
  constructor(public readonly code: 'too_large' | 'read_failed') {
    super(code);
  }
}

/**
 * Tek PDF seçer ve base64'e çevirir. Web'de seçici base64'ü kendisi veriyor;
 * telefonda dosya önbelleğe kopyalanıp okunuyor.
 */
export async function pickPdf(): Promise<PickedDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  if (asset.size != null && asset.size > MAX_PDF_BYTES) {
    throw new DocumentPickError('too_large');
  }

  let dataBase64 = asset.base64 ?? null;
  if (!dataBase64 && Platform.OS !== 'web') {
    try {
      dataBase64 = await new File(asset.uri).base64();
    } catch {
      throw new DocumentPickError('read_failed');
    }
  }
  if (!dataBase64) throw new DocumentPickError('read_failed');

  return { name: asset.name, dataBase64 };
}
