// WhatsApp Business Platform (Meta Cloud API) entegrasyonu.
// Kurulum: Meta for Developers > WhatsApp > API Setup üzerinden alınan
// Phone Number ID ve Access Token'ı backend/.env dosyasına ekleyin:
//   WHATSAPP_PHONE_NUMBER_ID=...
//   WHATSAPP_ACCESS_TOKEN=...
//   WHATSAPP_VERIFY_TOKEN=... (webhook doğrulaması için, kendiniz belirlersiniz)
//   WHATSAPP_APP_SECRET=...  (Meta uygulama gizli anahtarı; gelen webhook imzası bununla doğrulanır)
//
// Önemli kısıtlama: WhatsApp Business API, kullanıcı sizinle daha önce
// bir konuşma başlatmadıysa (24 saatlik pencere dışında) serbest metin
// mesajı göndermenize izin vermez; Meta'da onaylanmış bir "mesaj şablonu"
// gerekir (WHATSAPP_TEMPLATE_NAME). Kullanıcının kendi yazdığı mesaja cevap
// (Adım 7, asistan) pencere içinde olduğu için serbest metinle gider.
//
// WHATSAPP_MOCK=1: Graph API çağrılmaz, giden mesajlar bellekte tutulur
// (uçtan uca testler anahtarsız çalışır).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { toWhatsAppNumber } from './phone';

const env = () => ({
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
  templateName: process.env.WHATSAPP_TEMPLATE_NAME,
  appSecret: process.env.WHATSAPP_APP_SECRET,
  mock: process.env.WHATSAPP_MOCK === '1',
});

export function isWhatsAppMock() {
  return env().mock;
}

export function isWhatsAppConfigured() {
  const e = env();
  return e.mock || (!!e.phoneNumberId && !!e.accessToken);
}

// Sağlık ucu için (gizli değer dönmez).
const status = {
  lastWebhookVerifiedAt: null as Date | null,
  lastInboundAt: null as Date | null,
  // Teşhis: Meta POST atıyor mu, imza tutuyor mu, son yükte ne vardı (içerik değil, yalnızca tür).
  lastPostAt: null as Date | null,
  lastSignatureFailureAt: null as Date | null,
  postCount: 0,
  signatureFailureCount: 0,
  lastPostSummary: '' as string,
  // WABA aboneliği (ensureWabaSubscription): uygulama hesaba abone değilse Meta gerçek mesajları webhook'a iletmez.
  wabaSubscription: 'not_checked' as string,
};

export function markWebhookVerified() {
  status.lastWebhookVerifiedAt = new Date();
}

export function markPost(summary: string) {
  status.lastPostAt = new Date();
  status.postCount++;
  status.lastPostSummary = summary;
}

export function markSignatureFailure() {
  status.lastSignatureFailureAt = new Date();
  status.signatureFailureCount++;
}

export function markInbound() {
  status.lastInboundAt = new Date();
}

export function getWhatsAppStatus() {
  const e = env();
  return {
    configured: isWhatsAppConfigured(),
    mock: e.mock,
    appSecretSet: !!e.appSecret,
    verifyTokenSet: !!process.env.WHATSAPP_VERIFY_TOKEN,
    templateSet: !!e.templateName,
    lastWebhookVerifiedAt: status.lastWebhookVerifiedAt,
    lastInboundAt: status.lastInboundAt,
    lastPostAt: status.lastPostAt,
    postCount: status.postCount,
    lastPostSummary: status.lastPostSummary,
    lastSignatureFailureAt: status.lastSignatureFailureAt,
    signatureFailureCount: status.signatureFailureCount,
    wabaIdSet: !!process.env.WHATSAPP_WABA_ID,
    wabaSubscription: status.wabaSubscription,
  };
}

// Meta her webhook isteğini uygulama gizli anahtarıyla imzalar:
// X-Hub-Signature-256: sha256=<hex>. Ham gövde üzerinden hesaplanır (index.ts
// express.json verify ile saklar). Anahtar tanımlı değilse null döner; rota
// bunu "doğrulanamadı" diye ele alır.
export function verifyWhatsAppSignature(rawBody: Buffer | undefined, header: string | undefined): boolean | null {
  const secret = env().appSecret;
  if (!secret) return null;
  if (!rawBody || !header || !header.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const given = header.slice('sha256='.length);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given, 'utf8'), Buffer.from(expected, 'utf8'));
}

export function signWhatsAppBody(rawBody: Buffer | string, secret: string) {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

// Sahte kipte giden mesajlar (testler okur).
export const mockOutbound: { to: string; type: 'text' | 'template'; body: string }[] = [];

/**
 * Serbest metin mesajı gönderir. Sadece alıcı son 24 saat içinde işletmeyle
 * bir konuşma başlattıysa çalışır; aksi halde Meta hata döner.
 */
export async function sendWhatsAppText(toPhone: string, message: string): Promise<void> {
  if (env().mock) {
    mockOutbound.push({ to: toWhatsAppNumber(toPhone), type: 'text', body: message });
    return;
  }
  if (!isWhatsAppConfigured()) {
    console.log(`[whatsapp] yapılandırılmamış, mesaj gönderilmedi -> ${toPhone}: ${message}`);
    return;
  }
  await callGraphApi({
    to: toWhatsAppNumber(toPhone),
    type: 'text',
    text: { body: message },
  });
}

/**
 * Onaylı bir şablon üzerinden mesaj gönderir; 24 saatlik pencere dışında
 * (örn. ilk bildirim) bu yöntem kullanılmalıdır.
 */
export async function sendWhatsAppTemplate(toPhone: string, params: string[] = []): Promise<void> {
  const e = env();
  if (e.mock) {
    mockOutbound.push({ to: toWhatsAppNumber(toPhone), type: 'template', body: params.join(' | ') });
    return;
  }
  if (!isWhatsAppConfigured() || !e.templateName) {
    console.log(`[whatsapp] şablon yapılandırılmamış, mesaj gönderilmedi -> ${toPhone}`);
    return;
  }
  await callGraphApi({
    to: toWhatsAppNumber(toPhone),
    type: 'template',
    template: {
      name: e.templateName,
      language: { code: 'tr' },
      ...(params.length > 0
        ? { components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] }
        : {}),
    },
  });
}

async function callGraphApi(payload: Record<string, unknown>): Promise<void> {
  const e = env();
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${e.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${e.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[whatsapp] gönderim başarısız:', res.status, body);
      throw new Error(`whatsapp_send_failed_${res.status}`);
    }
  } catch (err) {
    console.error('[whatsapp] istek hatası:', err);
    throw err;
  }
}

// Uygulamayı WhatsApp Business hesabına abone eder (POST /{WABA_ID}/subscribed_apps) ve
// sonucu health'e yazar. Panelden kurulumda bu genelde otomatik olur; olmadıysa
// Meta test isteklerini gönderir ama gerçek mesajları iletmez. WHATSAPP_WABA_ID
// (gizli değil) tanımlıysa açılışta bir kez çalışır.
export async function ensureWabaSubscription(): Promise<void> {
  const wabaId = process.env.WHATSAPP_WABA_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!wabaId || !token || env().mock) return;
  const url = `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`;
  try {
    const post = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const postBody = await post.text();
    const get = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const getJson = (await get.json()) as { data?: { whatsapp_business_api_data?: { name?: string } }[]; error?: { message?: string } };
    const apps = (getJson.data ?? []).map((d) => d.whatsapp_business_api_data?.name ?? '?').join(',');
    status.wabaSubscription = post.ok ? `ok (abone uygulamalar: ${apps || '-'})` : `hata ${post.status}: ${postBody.slice(0, 200)}`;
  } catch (err) {
    status.wabaSubscription = `istek hatası: ${(err as Error).message}`;
  }
  console.log('[whatsapp] WABA aboneliği:', status.wabaSubscription);
}
