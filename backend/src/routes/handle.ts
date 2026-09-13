import type { Request, Response } from 'express';

// Express 4, async handler'lardaki reddedilen promise'leri yakalamıyor —
// yakalanmazsa istek 500 dönmek yerine askıda kalıyor.
export function makeHandle(label: string) {
  return function handle(fn: (req: Request, res: Response) => Promise<unknown>) {
    return (req: Request, res: Response) => {
      fn(req, res).catch((err) => {
        console.error(`[${label}]`, err);
        if (!res.headersSent) res.status(500).json({ error: 'server_error' });
      });
    };
  };
}
