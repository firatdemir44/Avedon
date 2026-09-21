import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, deleteVideo, type VideoRef } from '../api/client';
import { MAX_VIDEO_SECONDS, VideoPickError, pickVideo, uploadVideo } from './videoUpload';

export type VideoUploadState =
  | { phase: 'uploading'; progress: number; durationSeconds: number | null }
  | { phase: 'uploaded'; ref: VideoRef; durationSeconds: number | null };

export function videoErrorMessage(err: unknown) {
  if (err instanceof VideoPickError) {
    if (err.code === 'permission_denied') return 'Galeriye erişim izni verilmedi.';
    if (err.code === 'too_long') return `Video en fazla ${MAX_VIDEO_SECONDS} saniye olabilir.`;
    return 'Video dosyası çok büyük (en fazla 190 MB). Telefonun kamera ayarlarından video çözünürlüğünü 1080p\'ye düşürüp yeniden çekin.';
  }
  if (err instanceof ApiError) {
    if (err.code === 'video_not_configured') return 'Video paylaşımı henüz etkinleştirilmedi.';
    if (err.code === 'too_many_pending_uploads') return 'Yarım kalan çok fazla yükleme var, biraz sonra tekrar deneyin.';
    if (err.code === 'too_many_videos') return 'Bu ürüne en fazla 3 video eklenebilir.';
    if (err.code === 'video_in_use') return 'Bu video başka bir yerde kullanılıyor.';
    if (err.code === 'video_failed') return 'Video işlenemediği için eklenemedi.';
    if (err.code === 'not_your_company') return 'Yalnızca kendi firmanızın ürününe video ekleyebilirsiniz.';
  }
  return 'Video yüklenemedi, bağlantınızı kontrol edip tekrar deneyin.';
}

export function formatVideoDuration(seconds: number | null) {
  if (seconds == null) return '';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

interface Options {
  // Hata metni çağıranın kendi hata kutusunda gösterilsin (gönderi ekranında
  // fotoğraf hatalarıyla aynı yerde).
  onError?: (message: string) => void;
}

// Gönderi, ürün sayfası ve sohbet aynı yükleme akışını kullanıyor: galeriden
// seç → Cloudflare'e yükle → dönen videoId'yi bir yere bağla. Bağlanmadan
// ekrandan çıkılırsa video silinir (Cloudflare'de sahipsiz kalmasın).
export function useVideoUpload({ onError }: Options = {}) {
  const [video, setVideo] = useState<VideoUploadState | null>(null);
  const unattachedIdRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (unattachedIdRef.current) deleteVideo(unattachedIdRef.current).catch(() => {});
    };
  }, []);

  const pickAndUpload = useCallback(async (): Promise<VideoRef | null> => {
    let reservedId: string | null = null;
    try {
      const picked = await pickVideo();
      if (!picked) return null;
      setVideo({ phase: 'uploading', progress: 0, durationSeconds: picked.durationSeconds });
      const ref = await uploadVideo(picked, {
        onProgress: (progress) =>
          setVideo((prev) => (prev?.phase === 'uploading' ? { ...prev, progress } : prev)),
        onReserved: (reserved) => {
          reservedId = reserved.id;
          unattachedIdRef.current = reserved.id;
        },
      });
      setVideo({ phase: 'uploaded', ref, durationSeconds: picked.durationSeconds });
      return ref;
    } catch (err) {
      if (reservedId) {
        deleteVideo(reservedId).catch(() => {});
        if (unattachedIdRef.current === reservedId) unattachedIdRef.current = null;
      }
      setVideo(null);
      onError?.(videoErrorMessage(err));
      return null;
    }
  }, [onError]);

  // Video bir gönderiye/ürüne/mesaja bağlandı: artık bizim temizleme işimiz değil.
  const markAttached = useCallback(() => {
    unattachedIdRef.current = null;
    setVideo(null);
  }, []);

  // Kullanıcı vazgeçti: yüklenen dosyayı sil.
  const remove = useCallback(() => {
    if (unattachedIdRef.current) {
      deleteVideo(unattachedIdRef.current).catch(() => {});
      unattachedIdRef.current = null;
    }
    setVideo(null);
  }, []);

  return {
    video,
    uploading: video?.phase === 'uploading',
    uploadedRef: video?.phase === 'uploaded' ? video.ref : null,
    pickAndUpload,
    markAttached,
    remove,
  };
}
