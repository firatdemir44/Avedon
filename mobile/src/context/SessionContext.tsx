import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '../types';

const STORAGE_KEY = 'avedon_session_user';

interface SessionContextValue {
  user: User | null;
  isRestoring: boolean;
  setUser: (user: User | null) => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored) setUserState(JSON.parse(stored));
      })
      .catch(() => {})
      .finally(() => setIsRestoring(false));
  }, []);

  const setUser = (nextUser: User | null) => {
    setUserState(nextUser);
    if (nextUser) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser)).catch(() => {});
    } else {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    }
  };

  const value = useMemo<SessionContextValue>(() => ({ user, isRestoring, setUser }), [user, isRestoring]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
