import { fetchCompanyLogo } from '../../api/client';
import { createImageCache } from '../imageCache';

// Anahtar "firmaId|logoUpdatedAt". Logo değişince zaman damgası da değiştiği
// için eski logo önbellekte takılı kalmaz.
export function companyLogoKey(companyId: string, logoUpdatedAt: string) {
  return `${companyId}|${logoUpdatedAt}`;
}

const cache = createImageCache((key) => fetchCompanyLogo(key.split('|')[0]));

export const getCachedCompanyLogo = cache.get;
export const setCachedCompanyLogo = cache.set;
export const loadCompanyLogo = cache.load;
