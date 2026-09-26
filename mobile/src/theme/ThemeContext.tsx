import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildTheme, type Theme, type ThemeName } from './tokens';

// Açık/koyu tema anahtarı (DESIGN.md §1): seçilmemişse sistem tercihi. Seçim cihazda saklanır;
// web'de <html data-theme> de güncellenir ki design/tokens.css'i kullanan sayfalar aynı temada olsun.
export type ThemePreference = 'system' | ThemeName;
const STORAGE_KEY = 'takyon.theme';

// Yazı boyutu (Fırat 2026-09-26: "mesajlarda yazı küçük, kendim değiştirebilir miyim"): uygulama
// genelinde tüm metin stilleri bu oranla büyür. Telefonun kendi yazı boyutu ayarının üstüne eklenir.
export type TextSize = 'normal' | 'buyuk' | 'cokbuyuk';
const TEXT_SIZE_KEY = 'takyon.textSize';
const TEXT_SCALE: Record<TextSize, number> = { normal: 1, buyuk: 1.15, cokbuyuk: 1.3 };

function scaleTheme(theme: Theme, scale: number): Theme {
  if (scale === 1) return theme;
  const type = Object.fromEntries(
    Object.entries(theme.type).map(([k, v]) => [
      k,
      { ...v, fontSize: Math.round(v.fontSize * scale), lineHeight: Math.round(v.lineHeight * scale) },
    ])
  ) as Theme['type'];
  return { ...theme, type };
}

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  textSize: TextSize;
  setTextSize: (s: TextSize) => void;
}

const ThemeCtx = createContext<ThemeContextValue>({
  theme: buildTheme('light'),
  preference: 'system',
  setPreference: () => undefined,
  textSize: 'normal',
  setTextSize: () => undefined,
});

function applyHtmlTheme(name: ThemeName) {
  if (Platform.OS !== 'web') return;
  try {
    document.documentElement.setAttribute('data-theme', name);
    // Adres çubuğu / durum çubuğu rengi (PWA).
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = buildTheme(name).colors.surfaceBrand;
    document.body.style.backgroundColor = buildTheme(name).colors.surface0;
  } catch {
    // sessiz
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [textSize, setTextSizeState] = useState<TextSize>('normal');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === 'light' || v === 'dark' || v === 'system') setPreferenceState(v);
      })
      .catch(() => undefined);
    AsyncStorage.getItem(TEXT_SIZE_KEY)
      .then((v) => {
        if (v === 'normal' || v === 'buyuk' || v === 'cokbuyuk') setTextSizeState(v);
      })
      .catch(() => undefined);
  }, []);

  const name: ThemeName = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  useEffect(() => applyHtmlTheme(name), [name]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    AsyncStorage.setItem(STORAGE_KEY, p).catch(() => undefined);
    // Native'de sistem tercihi zorlanmaz; yalnızca uygulama içi tema değişir.
    if (Platform.OS !== 'web') Appearance.setColorScheme?.(p === 'system' ? 'unspecified' : p);
  }, []);

  const setTextSize = useCallback((s: TextSize) => {
    setTextSizeState(s);
    AsyncStorage.setItem(TEXT_SIZE_KEY, s).catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({ theme: scaleTheme(buildTheme(name), TEXT_SCALE[textSize]), preference, setPreference, textSize, setTextSize }),
    [name, preference, setPreference, textSize, setTextSize]
  );
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx).theme;
export const useTextSize = () => {
  const { textSize, setTextSize } = useContext(ThemeCtx);
  return { textSize, setTextSize };
};
export const useThemePreference = () => {
  const { preference, setPreference } = useContext(ThemeCtx);
  return { preference, setPreference };
};
