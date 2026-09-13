import { fetchProductImage } from '../../api/client';
import { createImageCache } from '../imageCache';

const cache = createImageCache(fetchProductImage);

export const getCachedProductImage = cache.get;
export const setCachedProductImage = cache.set;
export const loadProductImage = cache.load;
