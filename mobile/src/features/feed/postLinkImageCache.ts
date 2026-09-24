// Bağlantı kartı görselleri: gönderi fotoğrafları gibi akışta gelmez, tek tek çekilir.
import { fetchPostLinkImage } from '../../api/client';
import { createImageCache } from '../imageCache';

const cache = createImageCache(fetchPostLinkImage);

export const getCachedLinkImage = cache.get;
export const setCachedLinkImage = cache.set;
export const loadLinkImage = cache.load;
