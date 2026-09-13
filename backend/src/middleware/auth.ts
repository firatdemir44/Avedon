import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db';
import { verifySessionToken } from '../auth';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
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

export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'not_admin' });
    }
    next();
  });
}
