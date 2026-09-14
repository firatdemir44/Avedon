import * as ImagePicker from 'expo-image-picker';
import { File, UploadType } from 'expo-file-system';
import { requestVideoUploadUrl, type VideoRef } from '../api/client';

// Sunucudaki MAX_VIDEO_SECONDS ile aynı (kullanıcı kararı: 60 saniye).
export const MAX_VIDEO_SECONDS = 60;

export interface PickedVideo {
  uri: string;
  durationSeconds: number | null;
  mimeType: string;
}

export class VideoPickError extends Error {
  constructor(public readonly code: 'permission_denied' | 'too_long') {
    super(code);
  }
}

export async function pickVideo(): Promise<PickedVideo | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new VideoPickError('permission_denied');

  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  // `videoMaxDuration` yalnızca kamera kaydına uygulanıyor, galeriden seçilen
  // videoya değil; sınırı burada kontrol ediyoruz. Süre bilinmiyorsa geçiriyoruz,
  // sunucu işlenmiş videonun süresini ayrıca denetliyor.
  const durationSeconds = asset.duration != null ? asset.duration / 1000 : null;
  if (durationSeconds != null && durationSeconds > MAX_VIDEO_SECONDS + 0.5) {
    throw new VideoPickError('too_long');
  }

  return { uri: asset.uri, durationSeconds, mimeType: asset.mimeType ?? 'video/mp4' };
}

// Video sunucumuza değil doğrudan Cloudflare'e gidiyor; sunucu yalnızca tek
// kullanımlık yükleme adresini veriyor. İlerleme 0-1 arası bildirilir.
export async function uploadVideo(
  video: PickedVideo,
  onProgress?: (fraction: number) => void
): Promise<VideoRef> {
  const { video: ref, uploadURL } = await requestVideoUploadUrl();

  const task = new File(video.uri).createUploadTask(uploadURL, {
    httpMethod: 'POST',
    uploadType: UploadType.MULTIPART,
    fieldName: 'file',
    mimeType: video.mimeType,
    onProgress: ({ bytesSent, totalBytes }) => {
      if (totalBytes > 0) onProgress?.(Math.min(1, bytesSent / totalBytes));
    },
  });

  const result = await task.uploadAsync();
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`upload_failed_${result.status}`);
  }
  return ref;
}
