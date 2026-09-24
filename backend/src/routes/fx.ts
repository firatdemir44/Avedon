import { Router } from 'express';
import { optionalAuth } from '../middleware/auth';
import { getRates } from '../fx';
import { makeHandle } from './handle';

// TCMB döviz satış kurları (herkese açık veri; giriş isteğe bağlı).
export const fxRouter = Router();
fxRouter.use(optionalAuth);
const handle = makeHandle('fx');

fxRouter.get(
  '/',
  handle(async (_req, res) => {
    const r = await getRates();
    if (!r) return res.status(503).json({ error: 'fx_unavailable' });
    res.json(r);
  })
);
