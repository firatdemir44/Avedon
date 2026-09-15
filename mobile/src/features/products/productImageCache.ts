import { fetchProductImage, fetchProductImageAt } from '../../api/client';
import { MAX_PRODUCT_IMAGES } from './limits';
import { createImageCache } from '../imageCache';

// Kapak (sıra 0): liste küçük resimleri, gönderi ve numune ekranları.
const cover = createImageCache(fetchProductImage);
// Galerinin diğer fotoğrafları "urunId:sıra" anahtarıyla.
const gallery = createImageCache((key) => {
  const [id, position] = key.split(':');
  return fetchProductImageAt(id, Number(position));
});

const galleryKey = (productId: string, position: number) => `${productId}:${position}`;

export const getCachedProductImage = cover.get;
export const setCachedProductImage = cover.set;
export const loadProductImage = cover.load;

export function getCachedGalleryImage(productId: string, position: number) {
  return position === 0 ? cover.get(productId) : gallery.get(galleryKey(productId, position));
}

export function loadGalleryImage(productId: string, position: number) {
  return position === 0 ? cover.load(productId) : gallery.load(galleryKey(productId, position));
}

// Ürün kaydedilince: fotoğraflar yeniden sıralanmış ya da silinmiş olabilir.
// Eskileri atılır, elde olan yeni liste yazılır (eksikler ekranda yeniden çekilir).
export function replaceCachedProductImages(productId: string, urls: readonly (string | null)[]) {
  for (let position = 0; position < MAX_PRODUCT_IMAGES; position++) {
    if (position === 0) cover.delete(productId);
    else gallery.delete(galleryKey(productId, position));
  }
  urls.forEach((url, position) => {
    if (!url) return;
    if (position === 0) cover.set(productId, url);
    else gallery.set(galleryKey(productId, position), url);
  });
}
