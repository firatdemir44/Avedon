import { Platform } from 'react-native';
import { fetchPushPublicKey, subscribePush, unsubscribePush } from '../../api/client';

// Anlık bildirim (Web Push) — YALNIZCA WEB.
//
// Native'de (Expo Go / uygulama) burada hiçbir şey çalışmaz: her fonksiyon
// sessizce "desteklenmiyor" döner. Yeni paket kurulmadı; tarayıcının kendi
// Push API'si ve `public/sw.js` servis çalışanı kullanılıyor.
//
// Sunucu uçları: GET /push/public-key · POST /push/subscribe ·
// POST /push/unsubscribe · GET /push/status · POST /push/test.
//
// KURAL: buradaki hiçbir hata uygulamayı bozmaz — hepsi try/catch içinde,
// başarısızlık "kapalı" gibi davranır.

export type PushSupport = 'unsupported' | 'needs-install' | 'ready';
export type EnablePushResult = 'enabled' | 'denied' | 'unsupported' | 'not-configured' | 'error';
export type PushPermission = 'default' | 'granted' | 'denied' | 'unavailable';

export interface PushState {
  support: PushSupport;
  permission: PushPermission;
  subscribed: boolean;
}

const isWeb = Platform.OS === 'web';

function hasPushApis(): boolean {
  try {
    return (
      isWeb &&
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      typeof window !== 'undefined' &&
      'PushManager' in window &&
      'Notification' in window
    );
  } catch {
    return false;
  }
}

// iPadOS 13+ kendini "Macintosh" olarak tanıtıyor; dokunma noktası sayısıyla
// ayırt ediliyor.
function isIosLike(): boolean {
  try {
    const ua = navigator.userAgent || '';
    const touchPoints = (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0;
    return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  } catch {
    return false;
  }
}

// "Ana ekrana eklenmiş" (standalone) mi? iOS eski Safari'de `navigator.standalone`,
// diğerlerinde display-mode medya sorgusu.
function isStandalone(): boolean {
  try {
    const nav = navigator as Navigator & { standalone?: boolean };
    if (nav.standalone === true) return true;
    return window.matchMedia?.('(display-mode: standalone)')?.matches === true;
  } catch {
    return false;
  }
}

/**
 * 'unsupported' → bildirim kartı hiç gösterilmez.
 * 'needs-install' → iPhone/iPad'de Safari sekmesinde; Push ancak uygulama ana
 *   ekrandan açılınca çalışır, kullanıcıya bu anlatılır.
 * 'ready' → açılabilir.
 */
export function pushSupport(): PushSupport {
  if (!isWeb) return 'unsupported';
  try {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return 'unsupported';
    // iOS'ta sekmedeyken Push API kimi sürümlerde hiç görünmüyor; o yüzden
    // "desteklenmiyor" demeden önce kurulum ipucunu veriyoruz.
    if (isIosLike() && !isStandalone() && 'serviceWorker' in navigator) return 'needs-install';
    if (!hasPushApis()) return 'unsupported';
    return 'ready';
  } catch {
    return 'unsupported';
  }
}

export function pushPermission(): PushPermission {
  try {
    if (!isWeb || typeof window === 'undefined' || !('Notification' in window)) return 'unavailable';
    const value = Notification.permission;
    if (value === 'granted' || value === 'denied' || value === 'default') return value;
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

/**
 * Uygulamanın web sürümü Expo tarafından üretiliyor ve `index.html`'e manifest
 * eklenmiyor; ana ekrana eklenebilmesi (iOS'ta Push'un ön koşulu) için gerekli
 * etiketler açılışta bir kez buradan yazılıyor. Var olan etiketlere dokunulmaz.
 */
export function ensureManifestLink(): void {
  if (!isWeb) return;
  try {
    const doc = typeof document !== 'undefined' ? document : null;
    if (!doc?.head) return;

    // Tasarım token'ları (design/tokens.css kopyası): data-theme ile açık/koyu.
    if (!doc.head.querySelector('link[href="/tokens.css"]')) {
      const css = doc.createElement('link');
      css.setAttribute('rel', 'stylesheet');
      css.setAttribute('href', '/tokens.css');
      doc.head.appendChild(css);
    }
    const addLink = (rel: string, href: string) => {
      if (doc.head.querySelector(`link[rel="${rel}"]`)) return;
      const link = doc.createElement('link');
      link.setAttribute('rel', rel);
      link.setAttribute('href', href);
      doc.head.appendChild(link);
    };
    const addMeta = (name: string, content: string) => {
      if (doc.head.querySelector(`meta[name="${name}"]`)) return;
      const meta = doc.createElement('meta');
      meta.setAttribute('name', name);
      meta.setAttribute('content', content);
      doc.head.appendChild(meta);
    };

    addLink('manifest', '/manifest.webmanifest');
    addMeta('apple-mobile-web-app-capable', 'yes');
    addMeta('apple-mobile-web-app-title', 'Takyon');
    addLink('apple-touch-icon', '/apple-touch-icon.png');
    addMeta('mobile-web-app-capable', 'yes');
    // Çentikli ekranlarda içerik güvenli alan (env(safe-area-inset-*)) hesabıyla yerleşsin;
    // yakınlaştırma (erişilebilirlik) kapatılmaz.
    addMeta('apple-mobile-web-app-status-bar-style', 'default');
    const viewport = doc.head.querySelector('meta[name="viewport"]');
    const wanted = 'width=device-width, initial-scale=1, viewport-fit=cover';
    if (viewport) {
      const cur = viewport.getAttribute('content') || '';
      if (!cur.includes('viewport-fit=cover') || /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\D|$)/i.test(cur)) {
        viewport.setAttribute('content', wanted);
      }
    } else {
      addMeta('viewport', wanted);
    }
  } catch {
    // Sessiz: manifest eklenememesi uygulamayı etkilemez.
  }
}

// VAPID açık anahtarı base64url metin olarak geliyor; `pushManager.subscribe`
// ham bayt istiyor. ArrayBuffer döndürüyoruz: TypeScript'te `BufferSource`
// beklentisini Uint8Array'in jenerik tipiyle uğraşmadan karşılıyor.
function base64UrlToBuffer(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer as ArrayBuffer;
}

// Son açma denemesinin hangi adımda ve hangi hatayla düştüğü (ekranda kısa kod olarak
// gösterilir; kullanıcıdan tek fotoğrafla teşhis alınabilsin). Gizli değer içermez.
let lastPushError = '';
export const getLastPushError = () => lastPushError;
function fail(step: string, err?: unknown) {
  const e = err as { name?: string; message?: string } | undefined;
  lastPushError = [step, e?.name, e?.message?.slice(0, 80)].filter(Boolean).join(' / ');
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  try {
    if (!hasPushApis()) return null;
    const existing = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!existing) await navigator.serviceWorker.register('/sw.js');
    // Abonelik yalnızca ETKİN servis çalışanıyla kurulur; kayıt hemen döner ama çalışan
    // henüz kuruluyor olabilir ("no active Service Worker"). Hazır olana kadar beklenir.
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    if (!ready) fail('sw-hazir-degil');
    return ready;
  } catch (err) {
    fail('sw-kayit', err);
    return null;
  }
}

async function sendSubscriptionToServer(subscription: PushSubscription): Promise<boolean> {
  try {
    const json = subscription.toJSON();
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!json.endpoint || !p256dh || !auth) {
      fail('abonelik-eksik');
      return false;
    }
    await subscribePush({
      endpoint: json.endpoint,
      keys: { p256dh, auth },
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent?.slice(0, 200) : undefined,
    });
    return true;
  } catch (err) {
    const status = (err as { status?: number })?.status;
    fail(`sunucu-kayit${status ? '-' + status : ''}`, err);
    return false;
  }
}

/**
 * Bildirimleri açar: servis çalışanı kaydı → tarayıcı izni → sunucunun VAPID
 * açık anahtarı → abonelik → sunucuya kayıt.
 */
export async function enablePush(): Promise<EnablePushResult> {
  lastPushError = '';
  try {
    if (pushSupport() !== 'ready') return 'unsupported';

    const registration = await getRegistration();
    if (!registration) return 'error';

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      if (permission !== 'denied') fail(`izin-${permission}`);
      return permission === 'denied' ? 'denied' : 'error';
    }

    let publicKey = '';
    try {
      const key = await fetchPushPublicKey();
      if (!key.enabled || !key.publicKey) return 'not-configured';
      publicKey = key.publicKey;
    } catch (err) {
      fail('acik-anahtar', err);
      return 'error';
    }

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBuffer(publicKey),
      });
    }

    const ok = await sendSubscriptionToServer(subscription);
    if (ok) return 'enabled';

    // Var olan abonelik başka bir VAPID anahtarına ait olabilir: bir kez
    // tazeleyip yeniden deniyoruz.
    try {
      await subscription.unsubscribe();
      const fresh = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBuffer(publicKey),
      });
      return (await sendSubscriptionToServer(fresh)) ? 'enabled' : 'error';
    } catch (err) {
      fail('abone-yenile', err);
      return 'error';
    }
  } catch (err) {
    // Tarayıcı `subscribe` çağrısını reddedebilir (ör. iOS'ta sekmede).
    const name = (err as { name?: string })?.name;
    if (name === 'NotAllowedError') return 'denied';
    fail('abone', err);
    return 'error';
  }
}

/** Sunucudaki kaydı ve tarayıcıdaki aboneliği siler. Hata sessiz. */
export async function disablePush(): Promise<boolean> {
  try {
    const registration = await getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return true;
    try {
      await unsubscribePush(subscription.endpoint);
    } catch {
      // Sunucuya ulaşılamasa da tarayıcı aboneliğini kaldırıyoruz.
    }
    await subscription.unsubscribe().catch(() => false);
    return true;
  } catch {
    return false;
  }
}

/**
 * Çıkış yaparken çağrılır (SessionContext.logout), token silinmeden ÖNCE:
 * sunucudaki abonelik bu hesaptan düşsün ki sonraki kullanıcıya bildirim
 * gitmesin. Tarayıcı aboneliği de kaldırılır.
 */
export async function forgetPushOnLogout(): Promise<void> {
  if (!isWeb) return;
  try {
    await disablePush();
  } catch {
    // Sessiz: çıkış her hâlükârda tamamlanır.
  }
}

export async function currentPushState(): Promise<PushState> {
  const support = pushSupport();
  const permission = pushPermission();
  if (support !== 'ready' || permission !== 'granted') {
    return { support, permission, subscribed: false };
  }
  try {
    const registration = await getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    return { support, permission, subscribed: !!subscription };
  } catch {
    return { support, permission, subscribed: false };
  }
}

/**
 * Oturum açıkken uygulama açılışında bir kez: izin verilmiş ve tarayıcıda
 * abonelik duruyorsa sunucuya sessizce yeniden gönderilir. Abonelik başka bir
 * hesaba bağlanmış ya da sunucudan silinmiş olabilir.
 */
export async function resyncPushSubscription(): Promise<void> {
  if (!isWeb) return;
  try {
    if (pushSupport() !== 'ready' || pushPermission() !== 'granted') return;
    const registration = await getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await sendSubscriptionToServer(subscription);
  } catch {
    // Sessiz.
  }
}
