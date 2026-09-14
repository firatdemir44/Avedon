import * as ImagePicker from 'expo-image-picker';
import { File, UploadType } from 'expo-file-system';
import { fetchVideo, requestVideoUploadUrl, type VideoRef } from '../api/client';

// Sunucudaki MAX_VIDEO_SECONDS ile aynı (kullanıcı kararı: 60 saniye).
export const MAX_VIDEO_SECONDS = 60;

// Cloudflare'in tek parça (basic POST) yüklemesi 200 MB'a kadar. Üstü parça
// parça (tus) yükleme istiyor; o henüz yok, bu yüzden seçimde durduruyoruz.
export const MAX_VIDEO_BYTES = 190 * 1024 * 1024;

export interface PickedVideo {
  uri: string;
  durationSeconds: number | null;
  sizeBytes: number | null;
  mimeType: string;
}

export class VideoPickError extends Error {
  constructor(public readonly code: 'permission_denied' | 'too_long' | 'too_large') {
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
  const sizeBytes = asset.fileSize ?? null;
  if (sizeBytes != null && sizeBytes > MAX_VIDEO_BYTES) {
    throw new VideoPickError('too_large');
  }

  return { uri: asset.uri, durationSeconds, sizeBytes, mimeType: asset.mimeType ?? 'video/mp4' };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const CONFIRM_ATTEMPTS = 8;
const CONFIRM_DELAY_MS = 4000;

// Cloudflare dosyayı aldıysa video "uploading"den çıkar. Sunucu her sorguda
// durumu Stream'den tazeliyor.
async function confirmReceivedByCloudflare(videoId: string): Promise<VideoRef | null> {
  for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
    try {
      const { video } = await fetchVideo(videoId);
      if (video.status === 'processing' || video.status === 'ready') return video;
      if (video.status === 'error') return null;
    } catch {
      // Ağ anlık koptuysa bir sonraki denemede tekrar sorulur.
    }
    await sleep(CONFIRM_DELAY_MS);
  }
  return null;
}

interface UploadOptions {
  // 0-1 arası.
  onProgress?: (fraction: number) => void;
  // Yükleme adresi alınıp video kaydı açılır açılmaz çağrılır; başarısızlıkta
  // ya da ekrandan çıkışta çağıranın videoyu silebilmesi için.
  onReserved?: (ref: VideoRef) => void;
}

// Video sunucumuza değil doğrudan Cloudflare'e gidiyor; sunucu yalnızca tek
// kullanımlık yükleme adresini veriyor.
export async function uploadVideo(video: PickedVideo, options: UploadOptions = {}): Promise<VideoRef> {
  const { video: ref, uploadURL } = await requestVideoUploadUrl();
  options.onReserved?.(ref);

  const task = new File(video.uri).createUploadTask(uploadURL, {
    httpMethod: 'POST',
    uploadType: UploadType.MULTIPART,
    fieldName: 'file',
    mimeType: video.mimeType,
    onProgress: ({ bytesSent, totalBytes }) => {
      if (totalBytes > 0) options.onProgress?.(Math.min(1, bytesSent / totalBytes));
    },
  });

  let uploadOk = false;
  try {
    const result = await task.uploadAsync();
    uploadOk = result.status >= 200 && result.status < 300;
  } catch {
    uploadOk = false;
  }
  if (uploadOk) return ref;

  // Büyük dosyada dosya Cloudflare'e ulaştığı hâlde yanıt, dosya kütüphanesinin
  // Android'deki 60 sn okuma süresini aşabiliyor (2026-09-14: 153 MB'lık video
  // Cloudflare'de hazırdı ama uygulama hata sanıp gönderiye eklemedi). İstek
  // hata verse de Cloudflare dosyayı aldıysa başarılı sayıyoruz.
  const confirmed = await confirmReceivedByCloudflare(ref.id);
  if (confirmed) return confirmed;
  throw new Error('upload_failed');
}
