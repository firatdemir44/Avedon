import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

export type LoadStatus = 'loading' | 'ready' | 'error';

// Ekrana her odaklanıldığında veriyi yeniden çeken ekranların ortak mantığı.
//
// Neden: ekranlar her odakta `setLoading(true)` yapıyordu; alt ekrandan geri
// dönünce liste bir an kaybolup dönen çembere dönüyor, kaydırma konumu da
// sıfırlanıyordu. Burada iskelet YALNIZCA elde hiç veri yokken gösteriliyor;
// sonraki yüklemeler sessiz (eski veri ekranda kalır, yenisi gelince değişir).
//
// Durumlar:
// - status 'loading': ilk yükleme, veri yok → iskelet
// - status 'error':   veri yok ve yükleme başarısız → hata ekranı + Tekrar dene
// - status 'ready':   veri var (arka plan yenilemesi başarısızsa `error` dolu,
//                     içerik kalır, şerit gösterilir)
export function useFocusLoad<T>(
  fetcher: () => Promise<T>,
  options: { enabled?: boolean } = {}
) {
  const enabled = options.enabled ?? true;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<LoadStatus>(enabled ? 'loading' : 'ready');
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const hasDataRef = useRef(false);
  // Üst üste gelen isteklerde yalnızca en sonuncusunun sonucu yazılsın
  // (örn. aşağı çekme + odak yenilemesi aynı anda).
  const requestIdRef = useRef(0);

  const run = useCallback(
    (pull: boolean) => {
      if (!enabled) return Promise.resolve();
      const id = ++requestIdRef.current;
      if (pull) setRefreshing(true);
      if (!hasDataRef.current) setStatus('loading');
      return fetcherRef
        .current()
        .then((result) => {
          if (id !== requestIdRef.current) return;
          hasDataRef.current = true;
          setData(result);
          setError(null);
          setStatus('ready');
        })
        .catch((err: unknown) => {
          if (id !== requestIdRef.current) return;
          setError(err);
          setStatus(hasDataRef.current ? 'ready' : 'error');
        })
        .finally(() => {
          if (id === requestIdRef.current) setRefreshing(false);
        });
    },
    [enabled]
  );

  const reload = useCallback(() => run(false), [run]);
  const refresh = useCallback(() => run(true), [run]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  return { data, setData, status, error, refreshing, reload, refresh };
}
