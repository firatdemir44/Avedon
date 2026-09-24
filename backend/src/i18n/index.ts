// Sunucu tarafı çok dillilik (mobil src/i18n ile aynı model): Türkçe metin = anahtar.
// `t(lang, 'Türkçe metin', vars)` İngilizce sözlükte varsa onu döner, yoksa Türkçeyi.
// Dil kaynağı: isteğin `X-Lang` başlığı (req.lang); isteğe bağlı olmayan yerlerde (bildirim,
// arka plan işleri) kullanıcının kayıtlı `User.language` alanı.
import type { NextFunction, Request, Response } from 'express';
import { EN } from './en';

export type Lang = 'tr' | 'en';
export const normalizeLang = (v: unknown): Lang => (typeof v === 'string' && v.toLowerCase().startsWith('en') ? 'en' : 'tr');

export function t(lang: Lang | string | undefined, text: string, vars?: Record<string, string | number>): string {
  const base = normalizeLang(lang) === 'en' ? EN[text] ?? text : text;
  if (!vars) return base;
  return base.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

/** İsteğin dili: X-Lang başlığı, yoksa Accept-Language, yoksa tr. */
export function langMiddleware(req: Request, _res: Response, next: NextFunction) {
  req.lang = normalizeLang(req.header('x-lang') ?? req.header('accept-language'));
  next();
}
