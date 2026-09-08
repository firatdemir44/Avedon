import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = 'avedon_calc_';

/**
 * Bir hesap aracının alanlarını cihazda kalıcı tutar — kullanıcı aynı fiyat/oran
 * bilgilerini her seferinde yeniden girmek zorunda kalmaz, bir değeri değiştirdiğinde
 * otomatik olarak güncellenir. Sadece bu cihazda saklanır (backend'e gönderilmez).
 */
export function usePersistedFields<T extends object>(
  storageKey: string,
  initial: T
): [T, (patch: Partial<T>) => void] {
  const [values, setValues] = useState<T>(initial);
  const hydrated = useRef(false);

  useEffect(() => {
    hydrated.current = false;
    AsyncStorage.getItem(STORAGE_PREFIX + storageKey)
      .then((raw) => {
        if (raw) {
          const saved = JSON.parse(raw) as Partial<T>;
          setValues((prev) => ({ ...prev, ...saved }));
        }
      })
      .catch(() => {})
      .finally(() => {
        hydrated.current = true;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const update = (patch: Partial<T>) => {
    setValues((prev) => {
      const next = { ...prev, ...patch };
      if (hydrated.current) {
        AsyncStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(next)).catch(() => {});
      }
      return next;
    });
  };

  return [values, update];
}
