import { fetchCompanyPhoto, type CompanyPhotoKind } from '../../api/client';
import { createImageCache } from '../imageCache';
import { MAX_COMPANY_PHOTOS } from './limits';

// Firma galerisi fotoğrafları (ofis / sertifika). Fotoğraflar firma yanıtında
// gelmiyor; görünen küçük resimler tek tek çekilip önbellekte tutuluyor
// (ürün galerisindeki mantığın aynısı).
const cache = createImageCache((key) => {
  const [companyId, kind, position] = key.split(':');
  return fetchCompanyPhoto(companyId, kind as CompanyPhotoKind, Number(position));
});

const photoKey = (companyId: string, kind: CompanyPhotoKind, position: number) => `${companyId}:${kind}:${position}`;

export function getCachedCompanyPhoto(companyId: string, kind: CompanyPhotoKind, position: number) {
  return cache.get(photoKey(companyId, kind, position));
}

export function loadCompanyPhoto(companyId: string, kind: CompanyPhotoKind, position: number) {
  return cache.load(photoKey(companyId, kind, position));
}

// Galeri kaydedilince sıralar değişmiş ya da fotoğraf silinmiş olabilir:
// eski kopyalar atılır, elde olanlar yazılır.
export function replaceCachedCompanyPhotos(
  companyId: string,
  kind: CompanyPhotoKind,
  urls: readonly (string | null)[]
) {
  for (let position = 0; position < MAX_COMPANY_PHOTOS; position++) {
    cache.delete(photoKey(companyId, kind, position));
  }
  urls.forEach((url, position) => {
    if (url) cache.set(photoKey(companyId, kind, position), url);
  });
}
