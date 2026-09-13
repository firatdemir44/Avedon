import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { User } from '../types';
import { ApiError, fetchMe, setAuthToken } from '../api/client';

const USER_STORAGE_KEY = 'avedon_session_user';
const TOKEN_STORAGE_KEY = 'avedon_session_token';

interface SessionContextValue {
  user: User | null;
  isRestoring: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [storedUser, storedToken] = await Promise.all([
          AsyncStorage.getItem(USER_STORAGE_KEY),
          SecureStore.getItemAsync(TOKEN_STORAGE_KEY),
        ]);

        if (!storedToken) {
          setIsRestoring(false);
          return;
        }

        // Önce önbellekteki kullanıcıyı göster (hızlı açılış), sonra token'ı
        // /api/me ile doğrulayıp taze veriyle güncelle.
        if (storedUser) setUser(JSON.parse(storedUser));
        setAuthToken(storedToken);

        try {
          const { user: freshUser } = await fetchMe();
          setUser(freshUser);
          AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(freshUser)).catch(() => {});
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            // Token geçersiz/süresi dolmuş — oturumu temizle.
            setAuthToken(null);
            setUser(null);
            await Promise.all([
              AsyncStorage.removeItem(USER_STORAGE_KEY),
              SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY),
            ]);
          }
          // Ağ hatası/timeout ise önbellekteki kullanıcıyla devam et.
        }
      } finally {
        setIsRestoring(false);
      }
    })();
  }, []);

  const login = (token: string, nextUser: User) => {
    setAuthToken(token);
    setUser(nextUser);
    AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser)).catch(() => {});
    SecureStore.setItemAsync(TOKEN_STORAGE_KEY, token).catch(() => {});
  };

  const logout = () => {
    setAuthToken(null);
    setUser(null);
    AsyncStorage.removeItem(USER_STORAGE_KEY).catch(() => {});
    SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY).catch(() => {});
  };

  const value = useMemo<SessionContextValue>(() => ({ user, isRestoring, login, logout }), [user, isRestoring]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
