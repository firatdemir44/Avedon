import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchUnreadNotificationCount } from '../../api/client';

// Okunmamış bildirim sayacı (Faz 2, Adım 1). Zil birden çok sekmenin
// başlığında duruyor; her ekran ayrı ayrı sunucuyu yoklamasın diye sayı
// modül düzeyinde paylaşılıyor: tek zamanlayıcı, tek istek, tüm ziller.
// Push bildirimi yok, sayaç yoklamayla geliyor.
const POLL_MS = 60000;
// Odak tazelemeleri üst üste binmesin (sekme değiştikçe istek yağmuru olmasın).
const MIN_REFRESH_GAP_MS = 5000;

let unreadCount = 0;
let lastFetchAt = 0;
let inFlight = false;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<(count: number) => void>();

function publish(count: number) {
  if (count === unreadCount) return;
  unreadCount = count;
  for (const listener of listeners) listener(count);
}

function fetchCount() {
  // Uygulama arka plandayken boşuna istek atılmaz (hata da sessiz: kozmetik).
  if (AppState.currentState !== 'active') return;
  if (inFlight) return;
  const now = Date.now();
  // Sekme değiştikçe istek yağmuru olmasın: art arda odaklanmalar yutulur.
  if (now - lastFetchAt < MIN_REFRESH_GAP_MS) return;
  inFlight = true;
  lastFetchAt = now;
  fetchUnreadNotificationCount()
    .then(({ unreadCount: count }) => publish(count))
    .catch(() => {})
    .finally(() => {
      inFlight = false;
    });
}

function subscribe(listener: (count: number) => void) {
  listeners.add(listener);
  if (!timer) timer = setInterval(fetchCount, POLL_MS);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

// Bildirimler ekranı "okundu" işaretleyince sayaç beklemeden düzelsin.
export function setUnreadNotificationCount(count: number) {
  lastFetchAt = Date.now();
  publish(Math.max(0, count));
}

export function useUnreadNotifications(enabled = true) {
  const [count, setCount] = useState(unreadCount);

  useEffect(() => {
    if (!enabled) return;
    setCount(unreadCount);
    return subscribe(setCount);
  }, [enabled]);

  useFocusEffect(
    useCallback(() => {
      if (enabled) fetchCount();
    }, [enabled])
  );

  return enabled ? count : 0;
}
