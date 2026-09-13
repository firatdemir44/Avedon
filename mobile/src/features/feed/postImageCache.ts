import { fetchPostImage } from '../../api/client';
import { createImageCache } from '../imageCache';

const cache = createImageCache(fetchPostImage);

export const getCachedPostImage = cache.get;
export const setCachedPostImage = cache.set;
export const loadPostImage = cache.load;
