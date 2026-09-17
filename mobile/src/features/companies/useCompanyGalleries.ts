import { useCallback, useState } from 'react';
import type { EditablePhoto } from '../../components/PhotoGridEditor';
import type { CompanyPhotoInput, CompanyPhotoKind } from '../../api/client';
import { pickCompressedImage } from '../imagePicker';
import { getCachedCompanyPhoto, loadCompanyPhoto, replaceCachedCompanyPhotos } from './companyPhotoCache';
import { MAX_COMPANY_PHOTOS } from './limits';

type Galleries = Record<CompanyPhotoKind, EditablePhoto[]>;
type Dirty = Record<CompanyPhotoKind, boolean>;

const EMPTY: Galleries = { office: [], certificate: [] };

// Firma galerilerinin (ofis fotoğrafları + sertifikalar) düzenleme durumu.
// "Firmayı Düzenle" formu ve adım adım kurulum aynı mantığı kullanıyor:
// mevcut fotoğraflar yalnızca önizleme için indiriliyor, kaydederken eski
// sıralarıyla ({ existing }) gönderiliyor, yeniler data URL olarak gidiyor.
export function useCompanyGalleries(companyId: string) {
  const [photos, setPhotos] = useState<Galleries>(EMPTY);
  const [dirty, setDirty] = useState<Dirty>({ office: false, certificate: false });
  const [picking, setPicking] = useState<CompanyPhotoKind | null>(null);

  // Sunucudaki fotoğraf sayısına göre yer tutucular kurulur, sonra teker teker
  // (önbellekte yoksa) indirilir.
  const load = useCallback(
    (kind: CompanyPhotoKind, count: number) => {
      setPhotos((prev) => ({
        ...prev,
        [kind]: Array.from({ length: count }, (_, i) => ({
          key: `${kind}-mevcut-${i}`,
          existing: i,
          dataUrl: null,
          uri: getCachedCompanyPhoto(companyId, kind, i) ?? null,
        })),
      }));
      for (let i = 0; i < count; i++) {
        if (getCachedCompanyPhoto(companyId, kind, i)) continue;
        loadCompanyPhoto(companyId, kind, i)
          .then((url) => {
            setPhotos((prev) => ({
              ...prev,
              [kind]: prev[kind].map((p) => (p.existing === i && !p.uri ? { ...p, uri: url } : p)),
            }));
          })
          .catch(() => {});
      }
    },
    [companyId]
  );

  // Hata varsa kullanıcıya gösterilecek metni, yoksa null döndürür.
  const add = useCallback(async (kind: CompanyPhotoKind): Promise<string | null> => {
    let message: string | null = null;
    setPicking(kind);
    try {
      const picked = await pickCompressedImage();
      if (picked) {
        setPhotos((prev) =>
          prev[kind].length >= MAX_COMPANY_PHOTOS
            ? prev
            : {
                ...prev,
                [kind]: [...prev[kind], { key: `${kind}-yeni-${Date.now()}`, uri: picked.uri, dataUrl: picked.dataUrl }],
              }
        );
        setDirty((prev) => ({ ...prev, [kind]: true }));
      }
    } catch (err) {
      message =
        err instanceof Error && err.message === 'permission_denied'
          ? 'Galeriye erişim izni verilmedi.'
          : 'Fotoğraf işlenemedi, lütfen başka bir fotoğraf deneyin.';
    } finally {
      setPicking(null);
    }
    return message;
  }, []);

  const remove = useCallback((kind: CompanyPhotoKind, key: string) => {
    setPhotos((prev) => ({ ...prev, [kind]: prev[kind].filter((p) => p.key !== key) }));
    setDirty((prev) => ({ ...prev, [kind]: true }));
  }, []);

  const moveFirst = useCallback((kind: CompanyPhotoKind, key: string) => {
    setPhotos((prev) => {
      const target = prev[kind].find((p) => p.key === key);
      return target ? { ...prev, [kind]: [target, ...prev[kind].filter((p) => p.key !== key)] } : prev;
    });
    setDirty((prev) => ({ ...prev, [kind]: true }));
  }, []);

  const toInput = (list: EditablePhoto[]): CompanyPhotoInput[] =>
    list.map((p) => (p.existing !== undefined ? { existing: p.existing } : p.dataUrl!));

  // PATCH gövdesine eklenecek parça: değişmemiş galeri hiç gönderilmez.
  const payload = useCallback(
    (kinds: CompanyPhotoKind[] = ['office', 'certificate']) => ({
      ...(kinds.includes('office') && dirty.office ? { officePhotos: toInput(photos.office) } : {}),
      ...(kinds.includes('certificate') && dirty.certificate
        ? { certificatePhotos: toInput(photos.certificate) }
        : {}),
    }),
    [dirty, photos]
  );

  // Kayıt başarılı olduktan sonra: sıralar değişmiş olabilir, önbellekteki
  // eski sıralar yenileriyle değiştirilir ve galeri "temiz" sayılır.
  const commit = useCallback(
    (kinds: CompanyPhotoKind[] = ['office', 'certificate']) => {
      kinds.forEach((kind) => {
        if (!dirty[kind]) return;
        replaceCachedCompanyPhotos(
          companyId,
          kind,
          photos[kind].map((p) => p.dataUrl ?? p.uri)
        );
      });
      setDirty((prev) => {
        const next = { ...prev };
        kinds.forEach((kind) => {
          next[kind] = false;
        });
        return next;
      });
    },
    [companyId, dirty, photos]
  );

  return { photos, dirty, picking, load, add, remove, moveFirst, payload, commit };
}
