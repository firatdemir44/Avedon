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

/** İsteğin dili: X-Lang başlığı, yoksa Accept-Language, yoksa tr. İngilizcede yanıttaki etiketler çevrilir. */
export function langMiddleware(req: Request, res: Response, next: NextFunction) {
  req.lang = normalizeLang(req.header('x-lang') ?? req.header('accept-language'));
  if (req.lang === 'en') {
    const json = res.json.bind(res);
    res.json = (body?: unknown) => json(localizeLabels(body));
  }
  next();
}

// Önceden kurulmuş (değer gömülü) Türkçe cümleler için: sözlükte `{ad}` yer tutuculu bir anahtar
// varsa kalıp olarak eşleştirilir ve yakalanan değerler İngilizce karşılığa yerleştirilir.
// Ör. 'Kumaş çeşidi tanınmadı: Kaşe' → 'Fabric type not recognized: Kaşe'.
type Pattern = { re: RegExp; names: string[]; en: string; literal: number };
let patterns: Pattern[] | null = null;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function compiledPatterns() {
  if (patterns) return patterns;
  const list: Pattern[] = [];
  for (const [tr, en] of Object.entries(EN)) {
    // Yalnızca yer tutuculu ve gerçekten çeviri içeren anahtarlar ("{price}" gibi kimlikler her şeyi yutar).
    if (!/\{\w+\}/.test(tr) || tr === en) continue;
    const names: string[] = [];
    const parts = tr.split(/(\{\w+\})/);
    const literal = parts.filter((p) => !/^\{\w+\}$/.test(p)).join('').length;
    if (literal < 3) continue;
    const src = parts
      .map((part) => {
        const m = /^\{(\w+)\}$/.exec(part);
        if (m) {
          names.push(m[1]);
          return '(.+?)';
        }
        return escapeRe(part);
      })
      .join('');
    list.push({ re: new RegExp(`^${src}$`, 's'), names, en, literal });
  }
  // Özgül kalıp önce: sabit (yer tutucu dışı) metni uzun olan kazanır.
  patterns = list.sort((a, b) => b.literal - a.literal);
  return patterns;
}

/** Hazır Türkçe metni çevirir: önce birebir, olmazsa yer tutuculu kalıplarla. */
export function tx(lang: Lang | string | undefined, text: string): string {
  if (normalizeLang(lang) !== 'en' || !text) return text;
  if (EN[text]) return EN[text];
  for (const p of compiledPatterns()) {
    const m = p.re.exec(text);
    if (!m) continue;
    const vals: Record<string, string> = {};
    p.names.forEach((n, i) => (vals[n] = m[i + 1]));
    return p.en.replace(/\{(\w+)\}/g, (all, k) => vals[k] ?? all);
  }
  return text;
}

// Yanıt içindeki etiket alanları (label, statusLabel, typeLabel, hint…) İngilizce istekte
// sözlükten çevrilir. Yalnızca sözlükte BİREBİR bulunan değerler değişir (kullanıcı verisi
// sözlükte olmadığından dokunulmaz). Katalog/durum etiketlerini tek tek uç uca taşımadan
// kapsamak için; özel cümleler çağrı yerinde t()/tx() ile çevrilir.
const LABEL_KEY = /(^label$|Label$|^hint$|^labels$|Labels$)/;
export function localizeLabels(value: unknown, depth = 0): unknown {
  if (depth > 12 || value === null || typeof value !== 'object') return value;
  if (Buffer.isBuffer(value)) return value;
  const withJson = value as { toJSON?: () => unknown };
  if (typeof withJson.toJSON === 'function') return localizeLabels(withJson.toJSON(), depth + 1);
  if (Array.isArray(value)) return value.map((v) => localizeLabels(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (LABEL_KEY.test(k) && typeof v === 'string') out[k] = EN[v] ?? v;
    else if (LABEL_KEY.test(k) && Array.isArray(v)) out[k] = v.map((x) => (typeof x === 'string' ? EN[x] ?? x : localizeLabels(x, depth + 1)));
    // Eşleşme gerekçeleri (hazır cümleler) kalıpla çevrilir.
    else if (k === 'reasons' && Array.isArray(v)) out[k] = v.map((x) => (typeof x === 'string' ? tx('en', x) : localizeLabels(x, depth + 1)));
    else out[k] = localizeLabels(v, depth + 1);
  }
  return out;
}
