// Fotoğraflar liste yanıtlarında gelmiyor (payload'ı megabaytlara çıkarıyordu),
// görünür kartlar için tek tek çekiliyor. Aynı fotoğrafı her yeniden render'da
// tekrar indirmemek için bellekte tutuyoruz; aynı anda birden fazla istek
// gitmesin diye uçuştaki promise'ler de paylaşılıyor.
//
// Gönderi ve ürün fotoğrafları ayrı önbellek örnekleri kullanır — id uzayları
// farklı, tek bir Map'te tutulsa bir ürün id'si bir gönderi id'siyle çakışabilir.
const MAX_ENTRIES = 30;

export interface ImageCache {
  get(id: string): string | undefined;
  set(id: string, imageUrl: string): void;
  load(id: string): Promise<string>;
}

export function createImageCache(fetcher: (id: string) => Promise<{ imageUrl: string }>): ImageCache {
  const cache = new Map<string, string>();
  const inFlight = new Map<string, Promise<string>>();

  function set(id: string, imageUrl: string) {
    if (cache.size >= MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    cache.set(id, imageUrl);
  }

  return {
    get: (id) => cache.get(id),
    set,
    load(id) {
      const cached = cache.get(id);
      if (cached) return Promise.resolve(cached);

      const pending = inFlight.get(id);
      if (pending) return pending;

      const promise = fetcher(id)
        .then(({ imageUrl }) => {
          set(id, imageUrl);
          return imageUrl;
        })
        .finally(() => {
          inFlight.delete(id);
        });

      inFlight.set(id, promise);
      return promise;
    },
  };
}
