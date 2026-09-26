import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { CHOOSABLE, listMine, publicForCompany, publicForProduct, setChoice } from '../collaborations';
import { makeHandle } from './handle';

// Doğrulanmış iş birliği (docs/konfeksiyon-plani.md Bölüm C). Herkese açık uçlar yalnızca
// yayınlanmış kayıtları, gizlilik kuralına uygun alanlarla döner (madde 15).
export const collaborationsRouter = Router();
const handle = makeHandle('collaborations');

// Firma sayfası: yayınlanmış iş birlikleri.
collaborationsRouter.get(
  '/company/:companyId',
  handle(async (req, res) => {
    res.json({ collaborations: await publicForCompany(req.params.companyId) });
  })
);

// Kumaş ürün detayı: bu kumaşla çalışan firmalar.
collaborationsRouter.get(
  '/product/:productId',
  handle(async (req, res) => {
    res.json({ collaborations: await publicForProduct(req.params.productId) });
  })
);

// Firmamın tüm iş birlikleri (özel): seçim bekleyenler önce.
collaborationsRouter.get(
  '/mine',
  requireAuth,
  handle(async (req, res) => {
    const companyId = req.user!.companyId;
    if (!companyId) return res.json({ collaborations: [], pendingCount: 0 });
    const rows = await listMine(companyId);
    const pendingCount = rows.filter((r) => r.pending).length;
    res.json({ collaborations: [...rows.filter((r) => r.pending), ...rows.filter((r) => !r.pending)], pendingCount });
  })
);

const choiceSchema = z.object({ choice: z.enum(CHOOSABLE) }).strict();

// Kendi tarafımın seçimi. Taraf olmayan firmaya 404 (kaydın varlığı sızmasın).
collaborationsRouter.patch(
  '/:id/choice',
  requireAuth,
  handle(async (req, res) => {
    const parsed = choiceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const result = await setChoice({ collaborationId: req.params.id, userId: req.user!.id, companyId: req.user!.companyId, choice: parsed.data.choice });
    if (!result.ok) {
      if (result.error === 'invalid_choice') return res.status(400).json({ error: 'invalid_choice' });
      return res.status(404).json({ error: 'collaboration_not_found' });
    }
    const mine = await listMine(req.user!.companyId!);
    res.json({ collaboration: mine.find((r) => r.id === result.collaboration.id) ?? null });
  })
);
