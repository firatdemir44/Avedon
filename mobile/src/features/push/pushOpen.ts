import { Platform } from 'react-native';

// Bildirime dokununca nereye gidileceği (YALNIZCA WEB).
//
// `public/sw.js` iki yoldan haber veriyor:
//  1) uygulama açıksa pencereye `postMessage({ type:'avedon-push-open', target })`
//  2) uygulama kapalıysa `/?bildirim=<encodeURIComponent(JSON)>` ile açıyor
//
// Hedef sade tutuldu: mesaj bildirimi Mesajlar'a, diğer her tür Bildirimler
// ekranına gider. Bildirim satırının kendi ayrıntılı yönlendirmesi
// (NotificationsScreen içindeki `open`) burada KOPYALANMAZ — kullanıcı zaten
// doğru listede ve satıra dokununca oraya gider.

export interface PushTarget {
  kind: string;
  data: Record<string, unknown>;
}

const MESSAGE_TYPE = 'avedon-push-open';

function normalize(value: unknown): PushTarget | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { kind?: unknown; data?: unknown };
  const kind = typeof raw.kind === 'string' ? raw.kind : '';
  const data = raw.data && typeof raw.data === 'object' ? (raw.data as Record<string, unknown>) : {};
  if (!kind) return null;
  return { kind, data };
}

/**
 * Açılışta adres çubuğundaki `?bildirim=` parametresini okur ve okuduktan
 * sonra adresten temizler (yenilemede tekrar yönlenmesin).
 */
export function readPushTargetFromUrl(): PushTarget | null {
  if (Platform.OS !== 'web') return null;
  try {
    if (typeof window === 'undefined' || !window.location?.search) return null;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('bildirim');
    if (!raw) return null;

    params.delete('bildirim');
    const query = params.toString();
    const clean = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash ?? ''}`;
    window.history?.replaceState?.(null, '', clean);

    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Servis çalışanından gelen "bildirime dokunuldu" iletisini dinler.
 * Dönen fonksiyon dinlemeyi bırakır.
 */
export function subscribeToPushOpen(handler: (target: PushTarget) => void): () => void {
  if (Platform.OS !== 'web') return () => {};
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {};
    const listener = (event: MessageEvent) => {
      try {
        const payload = event.data as { type?: string; target?: unknown } | null;
        if (!payload || payload.type !== MESSAGE_TYPE) return;
        const target = normalize(payload.target);
        if (target) handler(target);
      } catch {
        // Sessiz.
      }
    };
    navigator.serviceWorker.addEventListener('message', listener);
    return () => {
      try {
        navigator.serviceWorker.removeEventListener('message', listener);
      } catch {
        // Sessiz.
      }
    };
  } catch {
    return () => {};
  }
}
