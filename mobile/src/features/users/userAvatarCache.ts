import { fetchUserAvatar } from '../../api/client';
import { createImageCache } from '../imageCache';

// Kişisel profil fotoğrafı önbelleği — firma logosundaki (companyLogoCache)
// desenin aynısı. Anahtar "kullaniciId|avatarUpdatedAt": fotoğraf değişince
// zaman damgası da değiştiği için eski fotoğraf önbellekte takılı kalmaz.
export function userAvatarKey(userId: string, avatarUpdatedAt: string) {
  return `${userId}|${avatarUpdatedAt}`;
}

const cache = createImageCache((key) => fetchUserAvatar(key.split('|')[0]));

export const getCachedUserAvatar = cache.get;
export const setCachedUserAvatar = cache.set;
export const loadUserAvatar = cache.load;
