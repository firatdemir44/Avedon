import { fetchUserCover } from '../../api/client';
import { createImageCache } from '../imageCache';

// Kapak fotoğrafı önbelleği — userAvatarCache'in aynısı. Anahtar
// "kullaniciId|coverUpdatedAt": kapak değişince zaman damgası da değiştiği için
// eski fotoğraf önbellekte takılı kalmaz.
export function userCoverKey(userId: string, coverUpdatedAt: string) {
  return `${userId}|${coverUpdatedAt}`;
}

const cache = createImageCache((key) => fetchUserCover(key.split('|')[0]));

export const getCachedUserCover = cache.get;
export const setCachedUserCover = cache.set;
export const loadUserCover = cache.load;
