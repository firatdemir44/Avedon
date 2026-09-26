import { Router } from 'express';
import { prisma } from '../db';
import { makeHandle } from './handle';
import { optionalAuth, requireAuth } from '../middleware/auth';
import {
  MAX_PRODUCTION_REFERENCES,
  checkReference,
  nextFreePosition,
  productionOptions,
  productionSchema,
  toProductionData,
  toProductionView,
} from '../production';

// Firma üretim kabiliyeti (docs/konfeksiyon-plani.md Bölüm A). /api/companies altına bağlanır.
export const productionRouter = Router();
const handle = makeHandle('production');

async function loadView(companyId: string, lang: string | undefined) {
  const [row, docs, refs] = await Promise.all([
    prisma.companyProduction.findUnique({ where: { companyId } }),
    prisma.companyPhoto.findMany({ where: { companyId, kind: 'certificate' }, select: { position: true } }),
    prisma.productionReference.findMany({
      where: { companyId },
      orderBy: { position: 'asc' },
      select: { position: true, caption: true, clientName: true, showClient: true },
    }),
  ]);
  return {
    production: toProductionView(row, docs.map((d) => d.position)),
    // Görselin kendisi dönmez; müşteri adı yalnızca firma göstermeyi seçtiyse.
    references: refs.map((r) => ({
      position: r.position,
      caption: r.caption,
      clientName: r.showClient ? r.clientName : '',
      showClient: r.showClient,
    })),
    options: productionOptions(lang),
  };
}

productionRouter.get(
  '/:id/production',
  optionalAuth,
  handle(async (req, res) => {
    const company = await prisma.company.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!company) return res.status(404).json({ error: 'company_not_found' });
    const view = await loadView(company.id, req.lang);
    // Sahibi, gizli müşteri adını da düzenleyebilmek için görür.
    if (req.user?.companyId === company.id) {
      const own = await prisma.productionReference.findMany({ where: { companyId: company.id }, select: { position: true, clientName: true } });
      const names = new Map(own.map((r) => [r.position, r.clientName]));
      view.references = view.references.map((r) => ({ ...r, clientName: names.get(r.position) ?? '' }));
    }
    res.json(view);
  })
);

productionRouter.put(
  '/:id/production',
  requireAuth,
  handle(async (req, res) => {
    if (req.user!.companyId !== req.params.id) return res.status(403).json({ error: 'not_your_company' });
    const parsed = productionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const data = toProductionData(parsed.data);
    await prisma.companyProduction.upsert({
      where: { companyId: req.params.id },
      create: { companyId: req.params.id, ...data },
      update: data,
    });
    res.json(await loadView(req.params.id, req.lang));
  })
);

productionRouter.post(
  '/:id/production/references',
  requireAuth,
  handle(async (req, res) => {
    const companyId = req.params.id;
    if (req.user!.companyId !== companyId) return res.status(403).json({ error: 'not_your_company' });
    const check = checkReference(req.body);
    if (!check.ok) return res.status(400).json({ error: check.error, details: check.details });
    const used = await prisma.productionReference.findMany({ where: { companyId }, select: { position: true } });
    const position = nextFreePosition(used.map((u) => u.position));
    if (position === null) return res.status(409).json({ error: 'too_many_references', max: MAX_PRODUCTION_REFERENCES });
    await prisma.productionReference.create({ data: { companyId, position, ...check.data } });
    res.status(201).json({ position, ...(await loadView(companyId, req.lang)) });
  })
);

const parsePosition = (value: string) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n < MAX_PRODUCTION_REFERENCES ? n : null;
};

productionRouter.delete(
  '/:id/production/references/:position',
  requireAuth,
  handle(async (req, res) => {
    const companyId = req.params.id;
    if (req.user!.companyId !== companyId) return res.status(403).json({ error: 'not_your_company' });
    const position = parsePosition(req.params.position);
    if (position === null) return res.status(404).json({ error: 'reference_not_found' });
    const result = await prisma.productionReference.deleteMany({ where: { companyId, position } });
    if (result.count === 0) return res.status(404).json({ error: 'reference_not_found' });
    res.json(await loadView(companyId, req.lang));
  })
);

// Firma fotoğraflarıyla aynı: görsel tek tek, herkese açık.
productionRouter.get(
  '/:id/production/references/:position/image',
  handle(async (req, res) => {
    const position = parsePosition(req.params.position);
    if (position === null) return res.status(404).json({ error: 'reference_not_found' });
    const ref = await prisma.productionReference.findUnique({
      where: { companyId_position: { companyId: req.params.id, position } },
      select: { imageUrl: true },
    });
    if (!ref) return res.status(404).json({ error: 'reference_not_found' });
    res.json({ imageUrl: ref.imageUrl });
  })
);
