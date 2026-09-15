import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db';
import { verifySessionToken } from '../auth';

function bearerToken(req: Request) {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const decoded = verifySessionToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    include: { company: true },
  });
  if (!user) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  req.user = user;
  next();
}

// Herkese açık uçlar için: geçerli oturum varsa req.user dolar (favori bilgisi,
// son bakılan kaydı), yoksa ya da jeton bozuksa istek anonim devam eder.
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = bearerToken(req);
  const decoded = token ? verifySessionToken(token) : null;
  if (decoded) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { company: true },
      });
      if (user) req.user = user;
    } catch (err) {
      console.error('[auth] isteğe bağlı oturum okunamadı', err);
    }
  }
  next();
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'not_admin' });
    }
    next();
  });
}
