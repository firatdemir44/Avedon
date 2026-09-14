import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { makeHandle } from './handle';
import { requireAuth } from '../middleware/auth';
import { PRODUCT_SELECT, toProductRow } from '../products';

export const companiesRouter = Router();

const handle = makeHandle('companies');

// Logo telefonda küçültülüp gönderiliyor; bu sınır sıkıştırılmamış bir
// fotoğrafın yanlışlıkla veritabanına girmesini engelliyor (~300 KB).
const MAX_LOGO_CHARS = 400_000;

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
  handle(async (req, res) => {
    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      include: {
        // Ürün fotoğrafları burada da dönmüyor: bir firmanın tüm kataloğu tek
        // yanıtta geldiği için en çok şişen yer burasıydı (bkz. src/products.ts).
        products: { select: PRODUCT_SELECT, orderBy: { createdAt: 'desc' } },
        users: { select: { id: true, firstName: true, lastName: true, position: true } },
      },
    });
    if (!company) {
      return res.status(404).json({ error: 'company_not_found' });
    }
    res.json({ company: { ...company, products: company.products.map(toProductRow) } });
  })
);

// Vergi numarası ve şirket kodu bilinçli olarak düzenlenemez: ilki doğrulamanın
// dayanağı, ikincisi çalışanların firmaya katılma anahtarı.
const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    about: z.string().trim().max(2000).optional(),
    contactEmail: z.union([z.string().trim().email().max(200), z.literal('')]).optional(),
    contactPhone: z.string().trim().max(30).optional(),
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

    const existing = await prisma.company.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, verification: true },
    });
    if (!existing) {
      return res.status(404).json({ error: 'company_not_found' });
    }

    const { logo, ...fields } = parsed.data;
    const nameChanged = fields.name !== undefined && fields.name !== existing.name;

    const company = await prisma.$transaction(async (tx) => {
      if (logo === null) {
        await tx.companyLogo.deleteMany({ where: { companyId: existing.id } });
      } else if (logo !== undefined) {
        await tx.companyLogo.upsert({
          where: { companyId: existing.id },
          create: { companyId: existing.id, imageUrl: logo },
          update: { imageUrl: logo },
        });
      }
      return tx.company.update({
        where: { id: existing.id },
        data: {
          ...fields,
          ...(logo === null ? { logoUpdatedAt: null } : logo !== undefined ? { logoUpdatedAt: new Date() } : {}),
          // Doğrulanmış bir firma adını değiştirirse yeniden incelemeye düşer;
          // yoksa onaylı rozet başka bir adla güven kazandırmaya devam ederdi.
          ...(nameChanged && existing.verification === 'dogrulanmis' ? { verification: 'inceleniyor' } : {}),
        },
      });
    });

    res.json({ company, verificationReset: nameChanged && existing.verification === 'dogrulanmis' });
  })
);
