// Adım 6 — Doku belirginleştirme (Dikkat). Sınırlı unsharp mask (σ=1, tek doğrusal kazanç,
// eşiksiz): var olan ayrıntıyı görünür kılar, ayrıntı EKLEMEZ. CLAHE kullanılmaz (bölgesel
// kontrast → bölgesel değişiklik sayılır). Odak yumuşaksa doz kısılır (gürültü şişmesin);
// 2× büyütülmüş çıktıda doz yarıya iner (büyütme artefaktını keskinleştirmemek için).

import { log, type Ctx } from './tip';

export type DokuParams = { doz: number; yumusakDoz: number; sigma: number };
export const DOKU: DokuParams = { doz: 0.5, yumusakDoz: 0.25, sigma: 1 };

export function doku(ctx: Ctx, p: DokuParams = DOKU) {
  const yumusak = ctx.uyarilar.includes('yumusak_odak');
  const doz = yumusak ? p.yumusakDoz : p.doz;
  ctx.keskinlik_doz = doz;
  log(ctx, {
    adim: 'doku_belirginlestirme',
    risk: 'dikkat',
    durum: 'uygulandi',
    doz,
    not: `Unsharp mask σ=${p.sigma}, kazanç ${doz}${yumusak ? ' (odak yumuşak: doz kısıldı)' : ''}; yakın plana uygulanmaz`,
    olcum: { sigma: p.sigma },
  });
}
