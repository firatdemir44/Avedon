import webpush from 'web-push';
import { prisma } from './db';

// Anlık bildirim (Web Push, VAPID). Pilot web uygulaması üzerinden yürüdüğü için tarayıcı bildirimi
// kullanılır: Android Chrome doğrudan; iPhone'da site "Ana Ekrana Ekle" ile kurulunca (iOS 16.4+).
// Ortam değişkenleri çağrı anında okunur (sms.ts ile aynı desen):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (npx web-push generate-vapid-keys), VAPID_SUBJECT (mailto:… ya da https://…)
//   PUSH_MOCK=1 → gönderim yapılmaz, mockOutbox'a yazılır (testler okur)
export interface PushPayload {
  title: string;
  body?: string;
  // Bildirime dokununca açılacak yer: istemci notificationTarget ile aynı veriyi kullanır.
  kind?: string;
  data?: Record<string, unknown>;
  // Aynı etiketli bildirim öncekinin yerine geçer (ör. aynı sohbetten art arda mesajlar).
  tag?: string;
}

export const mockOutbox: { userId: string; payload: PushPayload }[] = [];

const state = { lastAttemptAt: null as string | null, lastSuccessAt: null as string | null, lastError: null as string | null, sentCount: 0, failedCount: 0, prunedCount: 0 };

function config() {
  const publicKey = (process.env.VAPID_PUBLIC_KEY ?? '').trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY ?? '').trim();
  const subject = (process.env.VAPID_SUBJECT ?? '').trim() || 'https://avedon-blond.vercel.app';
  const mock = process.env.PUSH_MOCK === '1';
  return { publicKey, privateKey, subject, mock, ready: !!publicKey && !!privateKey };
}

export const isPushConfigured = () => config().mock || config().ready;
export const pushPublicKey = () => config().publicKey;

// Anahtar çifti geçerli mi: web-push kurulumda biçimi denetler (uzunluk, base64url). Gizli değer sızmaz.
function keyCheck(c: ReturnType<typeof config>): string | null {
  if (!c.ready) return null;
  try {
    webpush.setVapidDetails(c.subject, c.publicKey, c.privateKey);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export async function pushStatus() {
  const c = config();
  const keyError = keyCheck(c);
  let subscriptions: number | null = null;
  try {
    subscriptions = await prisma.pushSubscription.count();
  } catch {
    subscriptions = null;
  }
  return { configured: isPushConfigured() && !keyError, publicKeySet: !!c.publicKey, privateKeySet: !!c.privateKey, subjectSet: !!process.env.VAPID_SUBJECT, keyError, subscriptions, ...state };
}

// Hata bildirimi yazmayı ya da mesaj göndermeyi asla bozmaz; çağıran beklemek zorunda değildir.
export async function sendPush(userIds: readonly string[], payload: PushPayload): Promise<void> {
  const unique = [...new Set(userIds)];
  if (!unique.length) return;
  const c = config();
  if (c.mock) {
    for (const userId of unique) mockOutbox.push({ userId, payload });
    while (mockOutbox.length > 100) mockOutbox.shift();
    return;
  }
  if (!c.ready || keyCheck(c)) return;
  try {
    const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: unique } } });
    if (!subs.length) return;
    const body = JSON.stringify({ title: payload.title.slice(0, 120), body: (payload.body ?? '').slice(0, 300), kind: payload.kind ?? '', data: payload.data ?? {}, tag: payload.tag ?? '' });
    state.lastAttemptAt = new Date().toISOString();
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 24 });
          state.sentCount++;
          state.lastSuccessAt = new Date().toISOString();
          state.lastError = null;
          await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastSentAt: new Date() } }).catch(() => undefined);
        } catch (err) {
          const status = (err as { statusCode?: number })?.statusCode;
          // 404/410: abonelik artık yok (izin geri alındı, tarayıcı verisi silindi): kayıt temizlenir.
          if (status === 404 || status === 410) {
            state.prunedCount++;
            await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
            return;
          }
          state.failedCount++;
          state.lastError = `${status ?? 'ağ'}: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`;
          console.error('[push] gönderilemedi:', state.lastError);
        }
      })
    );
  } catch (err) {
    console.error('[push] hata:', err);
  }
}
