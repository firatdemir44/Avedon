import { fetchPostImage } from '../../api/client';

// Gönderi fotoğrafları akış listesinde gelmiyor (payload'ı megabaytlara
// çıkarıyordu), kart görünür olunca tek tek çekiliyor. Aynı fotoğrafı her
// yeniden render'da tekrar indirmemek için bellekte tutuyoruz; aynı anda birden
// fazla istek gitmesin diye uçuştaki promise'leri de paylaşıyoruz.
const MAX_ENTRIES = 30;

const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

export function getCachedPostImage(postId: string): string | undefined {
  return cache.get(postId);
}

export function setCachedPostImage(postId: string, imageUrl: string) {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(postId, imageUrl);
}

export function loadPostImage(postId: string): Promise<string> {
  const cached = cache.get(postId);
  if (cached) return Promise.resolve(cached);

  const pending = inFlight.get(postId);
  if (pending) return pending;

  const promise = fetchPostImage(postId)
    .then(({ imageUrl }) => {
      setCachedPostImage(postId, imageUrl);
      return imageUrl;
    })
    .finally(() => {
      inFlight.delete(postId);
    });

  inFlight.set(postId, promise);
  return promise;
}
