import { prisma } from './db';
import { VIDEO_SELECT, toVideoRow } from './videoFields';
import { deleteVideoCompletely } from './videos';

// Ürün sayfası ve sohbet videoları (VideoLink). Bir video tek bir yere bağlanır:
// gönderi (Post.videoId), ürün ya da mesaj.
export const MAX_PRODUCT_VIDEOS = 3;

export type ClaimError = 'video_not_found' | 'video_in_use' | 'video_failed';

// Bağlanacak video: çağıranın kendi yüklediği, hatalı olmayan ve henüz hiçbir yere bağlanmamış olmalı.
export async function checkClaimable(ownerId: string, videoId: string): Promise<ClaimError | null> {
  const video = await prisma.video.findUnique({ where: { id: videoId }, select: { ownerId: true, status: true, post: { select: { id: true } } } });
  if (!video || video.ownerId !== ownerId) return 'video_not_found';
  if (video.status === 'error') return 'video_failed';
  if (video.post) return 'video_in_use';
  if (await prisma.videoLink.findUnique({ where: { videoId }, select: { id: true } })) return 'video_in_use';
  return null;
}

export async function productVideos(productId: string) {
  const links = await prisma.videoLink.findMany({ where: { productId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  if (!links.length) return [];
  const videos = await prisma.video.findMany({ where: { id: { in: links.map((l) => l.videoId) } }, select: VIDEO_SELECT });
  return links.flatMap((l) => {
    const v = videos.find((x) => x.id === l.videoId);
    return v ? [toVideoRow(v)] : [];
  });
}

export async function messageVideos(messageIds: string[]) {
  const map = new Map<string, ReturnType<typeof toVideoRow>>();
  if (!messageIds.length) return map;
  const links = await prisma.videoLink.findMany({ where: { messageId: { in: messageIds } } });
  if (!links.length) return map;
  const videos = await prisma.video.findMany({ where: { id: { in: links.map((l) => l.videoId) } }, select: VIDEO_SELECT });
  for (const l of links) {
    const v = videos.find((x) => x.id === l.videoId);
    if (v && l.messageId) map.set(l.messageId, toVideoRow(v));
  }
  return map;
}

// Ürün silinince / video üründen kaldırılınca: bağ da, Stream'deki dosya da gider.
export async function removeLinkedVideo(videoId: string) {
  await prisma.videoLink.deleteMany({ where: { videoId } });
  await deleteVideoCompletely(videoId);
}
