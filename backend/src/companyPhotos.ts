import { Prisma } from '@prisma/client';
import { z } from 'zod';

// Firma sayfasındaki galeriler (Aşama B, orijinal tasarım "Firmanın ofisinden
// görseller" ve "Sertifikalar, başarılar").
export const COMPANY_PHOTO_KINDS = ['office', 'certificate'] as const;
export type CompanyPhotoKind = (typeof COMPANY_PHOTO_KINDS)[number];

// Galeri başına sınır. Fotoğraflar base64 data URL olarak saklandığı için
// sınırsız bırakmak veritabanını hızla şişirirdi.
export const MAX_COMPANY_PHOTOS = 12;

// Telefon fotoğrafı 1000 px'e küçültüp JPEG %60 ile gönderiyor (~150-250 KB,
// base64 ile ~%33 büyür); ürün fotoğraflarındaki sınırın aynısı.
const MAX_COMPANY_PHOTO_CHARS = 700_000;

const photoDataUrl = z.string().startsWith('data:image/').max(MAX_COMPANY_PHOTO_CHARS);

// Güncellemede öğe ya yeni fotoğraf (data URL) ya da mevcut fotoğrafın ESKİ
// sırası; böylece sıralama/silme için mevcut fotoğraflar yeniden yüklenmiyor.
export const companyPhotoListSchema = z
  .array(z.union([photoDataUrl, z.object({ existing: z.number().int().min(0).max(MAX_COMPANY_PHOTOS - 1) }).strict()]))
  .max(MAX_COMPANY_PHOTOS);

export class CompanyPhotoError extends Error {}

export async function replaceCompanyPhotos(
  tx: Prisma.TransactionClient,
  companyId: string,
  kind: CompanyPhotoKind,
  items: ReadonlyArray<string | { existing: number }>
) {
  const current = await tx.companyPhoto.findMany({
    where: { companyId, kind },
    select: { position: true, imageUrl: true },
  });
  const byPosition = new Map(current.map((photo) => [photo.position, photo.imageUrl]));

  const urls = items.map((item) => {
    if (typeof item === 'string') return item;
    const existing = byPosition.get(item.existing);
    if (existing === undefined) throw new CompanyPhotoError('unknown_existing_photo');
    return existing;
  });

  await tx.companyPhoto.deleteMany({ where: { companyId, kind } });
  if (urls.length > 0) {
    await tx.companyPhoto.createMany({
      data: urls.map((imageUrl, position) => ({ companyId, kind, position, imageUrl })),
    });
  }
}

// Firma yanıtında yalnızca sayılar döner; fotoğrafın kendisi
// GET /api/companies/:id/photos/:kind/:position ile tek tek çekilir.
export function photoCounts(photos: { kind: string }[]) {
  return {
    officePhotoCount: photos.filter((p) => p.kind === 'office').length,
    certificatePhotoCount: photos.filter((p) => p.kind === 'certificate').length,
  };
}
