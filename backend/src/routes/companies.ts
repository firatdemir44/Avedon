import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { makeHandle } from './handle';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { IN_STOCK, PRODUCT_SELECT, STOCK_FIRST_ORDER, toProductRow } from '../products';
import { isValidCompanyType } from '../catalog';
import { isValidTaxId, normalizeTaxId } from '../taxId';
import {
  COMPANY_PHOTO_KINDS,
  CompanyPhotoError,
  MAX_COMPANY_PHOTOS,
  companyPhotoListSchema,
  photoCounts,
  replaceCompanyPhotos,
  type CompanyPhotoKind,
} from '../companyPhotos';

export const companiesRouter = Router();

const handle = makeHandle('companies');

// Logo telefonda küçültülüp gönderiliyor; bu sınır sıkıştırılmamış bir
// fotoğrafın yanlışlıkla veritabanına girmesini engelliyor (~300 KB).
const MAX_LOGO_CHARS = 400_000;

// Galerideki tek fotoğraf (ofis ya da sertifika).
companiesRouter.get(
  '/:id/photos/:kind/:position',
  handle(async (req, res) => {
    const kind = req.params.kind as CompanyPhotoKind;
    const position = Number(req.params.position);
    if (
      !COMPANY_PHOTO_KINDS.includes(kind) ||
      !Number.isInteger(position) ||
      position < 0 ||
      position >= MAX_COMPANY_PHOTOS
    ) {
      return res.status(404).json({ error: 'photo_not_found' });
    }
    const photo = await prisma.companyPhoto.findUnique({
      where: { companyId_kind_position: { companyId: req.params.id, kind, position } },
      select: { imageUrl: true },
    });
    if (!photo) {
      return res.status(404).json({ error: 'photo_not_found' });
    }
    res.json({ imageUrl: photo.imageUrl });
  })
);

companiesRouter.get(
  '/',
  handle(async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    if (!search) {
      return res.json({ companies: [] });
    }
    const companies = await prisma.company.findMany({
      where: { name: { contains: search } },
      orderBy: { name: 'asc' },
      take: 10,
    });
    res.json({ companies });
  })
);

companiesRouter.get(
  '/:id/logo',
  handle(async (req, res) => {
    const logo = await prisma.companyLogo.findUnique({
      where: { companyId: req.params.id },
      select: { imageUrl: true },
    });
    if (!logo) {
      return res.status(404).json({ error: 'logo_not_found' });
    }
    res.json({ imageUrl: logo.imageUrl });
  })
);

companiesRouter.get(
  '/:id',
  optionalAuth,
  handle(async (req, res) => {
    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      include: {
        // Ürün fotoğrafları burada da dönmüyor: bir firmanın tüm kataloğu tek
        // yanıtta geldiği için en çok şişen yer burasıydı (bkz. src/products.ts).
        // Stoksuz ürünler yalnızca firmanın kendi ekibine.
        products: { where: req.user?.companyId === req.params.id ? {} : IN_STOCK, select: PRODUCT_SELECT, orderBy: STOCK_FIRST_ORDER },
        users: { select: { id: true, firstName: true, lastName: true, position: true, avatarUpdatedAt: true } },
        // Fotoğrafların kendisi değil yalnızca sayıları dönüyor.
        photos: { select: { kind: true } },
      },
    });
    if (!company) {
      return res.status(404).json({ error: 'company_not_found' });
    }
    const { photos, taxId, ...rest } = company;
    // Vergi numarası profilde görünmez; yalnızca firmanın kendi çalışanlarına döner.
    const own = !!req.user?.companyId && req.user.companyId === company.id;
    res.json({
      company: {
        ...rest,
        ...(own ? { taxId } : {}),
        products: company.products.map((p) => toProductRow(p, req.user?.companyId ?? null)),
        ...photoCounts(photos),
      },
    });
  })
);

// Şirket kodu bilinçli olarak düzenlenemez (çalışanların firmaya katılma anahtarı).
// Vergi numarası kayıtta atlanabildiği için sonradan eklenir/düzeltilir;
// doğrulanmış firmada değişirse firma yeniden incelemeye düşer.
const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    // VKN 10, TCKN 11 hane; boşluk/tire ayıklanır.
    taxId: z.string().max(40).transform(normalizeTaxId).refine(isValidTaxId, 'invalid_tax_id').optional(),
    about: z.string().trim().max(2000).optional(),
    contactEmail: z.union([z.string().trim().email().max(200), z.literal('')]).optional(),
    contactPhone: z.string().trim().max(30).optional(),
    // Firma sayfası "Şirket Genel Bakışı" alanları (Aşama B).
    companyType: z.string().trim().max(40).optional(),
    // Tekstil sektöründe kurulmuş en eski firmalar 1800'lerden; üst sınır
    // içinde bulunulan yıl (gelecekte kurulmuş firma olmaz).
    foundedYear: z.union([z.coerce.number().int().min(1800).max(new Date().getFullYear()), z.null()]).optional(),
    website: z.string().trim().max(200).optional(),
    city: z.string().trim().max(80).optional(),
    district: z.string().trim().max(80).optional(),
    address: z.string().trim().max(300).optional(),
    mainMarkets: z.string().trim().max(200).optional(),
    // Verilirse o galerinin TAMAMI bu liste olur; verilmezse dokunulmaz.
    officePhotos: companyPhotoListSchema.optional(),
    certificatePhotos: companyPhotoListSchema.optional(),
    // data URL: yeni logo · null: logoyu kaldır · alan yok: logoya dokunma
    logo: z.string().startsWith('data:image/').max(MAX_LOGO_CHARS).nullable().optional(),
  })
  .strict();

companiesRouter.patch(
  '/:id',
  requireAuth,
  handle(async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    // Firmayı yalnızca o firmanın çalışanı düzenleyebilir.
    if (req.user!.companyId !== req.params.id) {
      return res.status(403).json({ error: 'not_your_company' });
    }

    if (parsed.data.companyType !== undefined && !isValidCompanyType(parsed.data.companyType)) {
      return res.status(400).json({ error: 'invalid_body', details: { fieldErrors: { companyType: ['invalid_company_type'] } } });
    }

    const existing = await prisma.company.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, taxId: true, verification: true },
    });
    if (!existing) {
      return res.status(404).json({ error: 'company_not_found' });
    }

    const { logo, officePhotos, certificatePhotos, ...fields } = parsed.data;
    const nameChanged = fields.name !== undefined && fields.name !== existing.name;
    const taxIdChanged = fields.taxId !== undefined && fields.taxId !== existing.taxId;
    const verificationReset = (nameChanged || taxIdChanged) && existing.verification === 'dogrulanmis';

    let company;
    try {
      company = await prisma.$transaction(async (tx) => {
        if (logo === null) {
          await tx.companyLogo.deleteMany({ where: { companyId: existing.id } });
        } else if (logo !== undefined) {
          await tx.companyLogo.upsert({
            where: { companyId: existing.id },
            create: { companyId: existing.id, imageUrl: logo },
            update: { imageUrl: logo },
          });
        }
        // Galeriler: verilen liste o galerinin yeni tam hali.
        if (officePhotos) await replaceCompanyPhotos(tx, existing.id, 'office', officePhotos);
        if (certificatePhotos) await replaceCompanyPhotos(tx, existing.id, 'certificate', certificatePhotos);
        return tx.company.update({
          where: { id: existing.id },
          data: {
            ...fields,
            ...(logo === null ? { logoUpdatedAt: null } : logo !== undefined ? { logoUpdatedAt: new Date() } : {}),
            // Doğrulanmış bir firma adını ya da vergi numarasını değiştirirse yeniden
            // incelemeye düşer; yoksa onaylı rozet başka bir kimlikle güven kazandırırdı.
            ...(verificationReset ? { verification: 'inceleniyor' } : {}),
          },
        });
      });
    } catch (err) {
      if (err instanceof CompanyPhotoError) {
        return res.status(400).json({ error: 'invalid_body', details: { fieldErrors: { photos: [err.message] } } });
      }
      throw err;
    }

    res.json({ company, verificationReset });
  })
);
