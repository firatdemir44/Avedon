import { prisma } from './db';
import { canViewPost } from './posts';
import { createPlaybackToken, deleteStreamVideo, getStreamVideo, isStreamConfigured } from './stream';
import { VIDEO_SELECT, type VideoRecord } from './videoFields';

// Kullanıcı kararı (2026-09-14): en fazla 60 saniye. Hem telefonda seçim anında
// hem Stream'e yükleme adresi istenirken hem de işlenmiş videonun süresi
// okunduğunda kontrol ediliyor.
export const MAX_VIDEO_SECONDS = 60;

// Bir kullanıcının bir saat içinde tamamlanmamış en fazla bu kadar yükleme
// adresi olabilir. Her adres Stream deposundan 60 saniye ayırıyor; sınırsız
// istenirse ücretli depo boşuna dolardı.
export const MAX_PENDING_UPLOADS_PER_HOUR = 10;

// Yükleme adresi alınıp hiç kullanılmayan videolar bu süreden sonra hatalı sayılır.
const UPLOAD_ABANDON_MS = 60 * 60 * 1000;

const FINAL_STATUSES = new Set(['ready', 'error']);

export function isFinalStatus(status: string) {
  return FINAL_STATUSES.has(status);
}

export async function refreshVideoStatus(video: VideoRecord): Promise<VideoRecord> {
  if (isFinalStatus(video.status)) return video;

  const remote = await getStreamVideo(video.streamUid);

  let data: Partial<Pick<VideoRecord, 'status' | 'durationSeconds' | 'errorReason' | 'playbackHost' | 'readyAt'>>;
  if (!remote) {
    if (Date.now() - video.createdAt.getTime() < UPLOAD_ABANDON_MS) return video;
    data = { status: 'error', errorReason: 'upload_abandoned' };
  } else if (remote.state === 'error') {
    data = { status: 'error', errorReason: remote.errorReasonCode || 'encode_failed' };
  } else if (remote.readyToStream) {
    // Stream'e verilen maxDurationSeconds bir depo ayırma değeri; uzun bir
    // dosyanın reddedileceği dokümanda garanti edilmiyor, o yüzden işlenmiş
    // süreyi burada da kontrol ediyoruz.
    if (remote.durationSeconds > MAX_VIDEO_SECONDS + 1) {
      data = { status: 'error', errorReason: 'too_long' };
      deleteStreamVideo(video.streamUid).catch((err) => console.error('[videos] too_long delete', err));
    } else {
      data = {
        status: 'ready',
        durationSeconds: remote.durationSeconds,
        playbackHost: remote.playbackHost,
        readyAt: new Date(),
      };
    }
  } else {
    data = { status: remote.state === 'pendingupload' ? 'uploading' : 'processing' };
  }

  if (data.status === video.status && Object.keys(data).length === 1) return video;
  return prisma.video.update({ where: { id: video.id }, data, select: VIDEO_SELECT });
}

// Liste uçları için: işlenmekte olan en fazla `limit` videoyu tazeler. Hatası
// listeyi düşürmesin diye tek tek yakalanıyor.
export async function refreshPendingVideos(items: { video: VideoRecord | null }[], limit = 5) {
  if (!isStreamConfigured()) return;
  const pending = items.filter((item) => item.video && !isFinalStatus(item.video.status)).slice(0, limit);
  await Promise.all(
    pending.map(async (item) => {
      try {
        item.video = await refreshVideoStatus(item.video!);
      } catch (err) {
        console.error('[videos] refresh', err);
      }
    })
  );
}

// Video ya sahibine ya da bağlı olduğu içeriği görebilen kişiye açık. Yetki
// yoksa null: çağıran 404 döner (403, videonun var olduğunu doğrulardı).
export async function loadViewableVideo(viewerId: string, videoId: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { ...VIDEO_SELECT, post: { select: { authorId: true, visibility: true } } },
  });
  if (!video) return null;
  if (video.ownerId === viewerId) return video;
  if (video.post && (await canViewPost(viewerId, video.post))) return video;
  return null;
}

export async function createPlaybackUrls(video: VideoRecord) {
  const token = await createPlaybackToken(video.streamUid);
  const base = `https://${video.playbackHost}/${token}`;
  return {
    hlsUrl: `${base}/manifest/video.m3u8`,
    thumbnailUrl: `${base}/thumbnails/thumbnail.jpg?time=1s&height=480`,
  };
}

// İçerik silinince video Stream'den de silinir; yoksa ücretli depoda sahipsiz
// dosya olarak kalırdı. Stream silme başarısız olsa bile kayıt silinir ve hata
// loglanır (dosya elle temizlenebilir).
export async function deleteVideoCompletely(videoId: string) {
  const video = await prisma.video.findUnique({ where: { id: videoId }, select: { id: true, streamUid: true } });
  if (!video) return;
  try {
    await deleteStreamVideo(video.streamUid);
  } catch (err) {
    console.error('[videos] stream delete failed', video.streamUid, err);
  }
  await prisma.video.delete({ where: { id: video.id } });
}
