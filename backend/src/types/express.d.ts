import type { Company, User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: User & { company: Company | null };
      /** Arayüz dili (X-Lang); langMiddleware doldurur. */
      lang?: 'tr' | 'en';
    }
  }
}

export {};
