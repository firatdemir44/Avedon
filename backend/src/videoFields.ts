import { Prisma } from '@prisma/client';

// Hem posts.ts hem videos.ts kullanıyor; ayrı dosyada durması içe aktarma
// döngüsünü önlüyor (videos.ts erişim kontrolü için posts.ts'e bağımlı).
export const VIDEO_SELECT = {
  id: true,
  ownerId: true,
  streamUid: true,
  status: true,
  durationSeconds: true,
  errorReason: true,
  playbackHost: true,
  createdAt: true,
  readyAt: true,
} satisfies Prisma.VideoSelect;

export type VideoRecord = Prisma.VideoGetPayload<{ select: typeof VIDEO_SELECT }>;

// İstemciye giden biçim. streamUid ve playbackHost bilinçli olarak yok:
// oynatma adresi yalnızca yetki kontrolünden sonra /playback ucundan veriliyor.
export function toVideoRow(video: VideoRecord) {
  return {
    id: video.id,
    status: video.status,
    durationSeconds: video.durationSeconds,
    errorReason: video.errorReason,
  };
}
