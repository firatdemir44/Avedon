import type { Company, User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: User & { company: Company | null };
    }
  }
}

export {};
