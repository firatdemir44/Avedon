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

// Toplu ürün aktarımı için: Excel, CSV, PDF ya da görsel (sunucu sınırı 10 MB).
export const IMPORT_FILE_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'text/comma-separated-values',
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

const EXT_MIME: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export interface PickedImportFile {
  name: string;
  dataUrl: string;
}

/** Tek dosya seçer ve data URL'e çevirir (tür uzantıdan da çıkarılır). */
export async function pickImportFile(): Promise<PickedImportFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: IMPORT_FILE_TYPES, multiple: false, copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  if (asset.size != null && asset.size > MAX_PDF_BYTES) throw new DocumentPickError('too_large');

  let data = asset.base64 ?? null;
  if (!data && Platform.OS !== 'web') {
    try {
      data = await new File(asset.uri).base64();
    } catch {
      throw new DocumentPickError('read_failed');
    }
  }
  // Web'de bazı sürümler base64 yerine data URL'i uri'de verir.
  if (!data && asset.uri?.startsWith('data:')) data = asset.uri;
  if (!data) throw new DocumentPickError('read_failed');
  if (data.startsWith('data:')) {
    const comma = data.indexOf(',');
    data = data.slice(comma + 1);
  }
  const ext = (asset.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();
  const mime = EXT_MIME[ext] ?? asset.mimeType ?? 'application/octet-stream';
  return { name: asset.name, dataUrl: `data:${mime};base64,${data}` };
}
