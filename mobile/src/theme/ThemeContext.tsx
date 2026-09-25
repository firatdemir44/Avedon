import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildTheme, type Theme, type ThemeName } from './tokens';

// Açık/koyu tema anahtarı (DESIGN.md §1): seçilmemişse sistem tercihi. Seçim cihazda saklanır;
// web'de <html data-theme> de güncellenir ki design/tokens.css'i kullanan sayfalar aynı temada olsun.
export type ThemePreference = 'system' | ThemeName;
const STORAGE_KEY = 'takyon.theme';

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

const ThemeCtx = createContext<ThemeContextValue>({ theme: buildTheme('light'), preference: 'system', setPreference: () => undefined });

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

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === 'light' || v === 'dark' || v === 'system') setPreferenceState(v);
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

  const value = useMemo(() => ({ theme: buildTheme(name), preference, setPreference }), [name, preference, setPreference]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx).theme;
export const useThemePreference = () => {
  const { preference, setPreference } = useContext(ThemeCtx);
  return { preference, setPreference };
};
