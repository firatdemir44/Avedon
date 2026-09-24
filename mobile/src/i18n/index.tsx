// Takyon çok dillilik (TR varsayılan, EN). Tasarım kararı (2026-09-24):
// - "Türkçe metin = anahtar" (gettext tarzı): kodda `t('Kod gönder')` yazılır; İngilizce sözlükte
//   karşılığı varsa o gösterilir, yoksa Türkçe metin kalır. Böylece çeviri eksik kalsa bile ekran bozulmaz
//   ve Türkçe kaynak metin tek yerde durur.
// - Değişken: `t('{n} ürün', { n: 3 })` → "3 ürün" / "3 products". Tekil/çoğul için sözlükte
//   `'{n} ürün'` → `'{n} products'` yeterli; özel durumda `tp()` kullanılır.
// - Bileşen dışı yardımcılar (biçimlendiriciler, sabit etiketler) da `tr()` ile çevrilir; dil değişince
//   RootNavigator dile göre yeniden kurulduğu için tüm ekranlar yeni dille çizilir.
// - Sunucuya dil `X-Lang` başlığıyla gider (hata mesajları, asistan cevap dili, bildirimler).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EN } from './en';

export type Lang = 'tr' | 'en';
const STORAGE_KEY = 'takyon.lang';

let current: Lang = 'tr';
const listeners = new Set<(l: Lang) => void>();
const missing = new Set<string>();

export const getLang = () => current;
/** Tarih/sayı biçimlendirme için yerel ayar. */
export const locale = () => (current === 'en' ? 'en-GB' : 'tr-TR');

function interpolate(text: string, vars?: Record<string, string | number>) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

/** Çeviri: Türkçe kaynak metni verilir. */
export function tr(text: string, vars?: Record<string, string | number>): string {
  if (current === 'tr' || !text) return interpolate(text, vars);
  const hit = EN[text];
  if (hit === undefined) {
    if (__DEV__ && !missing.has(text)) {
      missing.add(text);
      // Geliştirmede eksik çeviriler görünsün (canlıda sessiz).
      console.warn('[i18n] EN eksik:', text);
    }
    return interpolate(text, vars);
  }
  return interpolate(hit, vars);
}

/** Tekil/çoğul: İngilizcede n === 1 için ayrı metin. */
export function tp(one: string, other: string, n: number, vars?: Record<string, string | number>) {
  return tr(n === 1 ? one : other, { n, ...vars });
}

function deviceLang(): Lang {
  try {
    const l =
      Platform.OS === 'web' && typeof navigator !== 'undefined'
        ? navigator.language
        : Intl.DateTimeFormat().resolvedOptions().locale;
    return l?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
  } catch {
    return 'tr';
  }
}

function applyLang(l: Lang) {
  current = l;
  if (Platform.OS === 'web' && typeof document !== 'undefined') document.documentElement.lang = l;
  listeners.forEach((fn) => fn(l));
}

/** Dil değişince haber al (ör. API istemcisi başlığı). */
export function onLangChange(fn: (l: Lang) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: typeof tr; ready: boolean };
const I18nContext = createContext<Ctx>({ lang: 'tr', setLang: () => undefined, t: tr, ready: true });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        const l: Lang = saved === 'tr' || saved === 'en' ? saved : deviceLang();
        applyLang(l);
        setLangState(l);
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  const setLang = useCallback((l: Lang) => {
    applyLang(l);
    setLangState(l);
    AsyncStorage.setItem(STORAGE_KEY, l).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ lang, setLang, t: tr, ready }), [lang, setLang, ready]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
