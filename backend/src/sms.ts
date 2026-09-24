import crypto from 'crypto';

// SMS ile doğrulama kodu (Faz 1, Adım 8). Sağlayıcı: İleti Merkezi (docs/sms-saglayici.md).
// Uçlar ve gövde 2026-09-18'de resmi dokümandan doğrulandı (toplusmsapi.com):
//   POST https://api.iletimerkezi.com/v1/send-sms/json
//   POST https://api.iletimerkezi.com/v1/get-balance/json
//   hash = HMAC-SHA256(veri: API anahtarı, anahtar: gizli anahtar), hex
// Ortam değişkenleri çağrı anında okunur (whatsapp.ts ile aynı desen):
//   SMS_PROVIDER=iletimerkezi | mock   (boş = kapalı: kod yalnızca sunucu kaydına düşer)
//   ILETIMERKEZI_KEY, ILETIMERKEZI_SENDER (onaylı başlık, en çok 11 karakter) ve şunlardan BİRİ:
//   ILETIMERKEZI_HASH   (panel "API Hash"i hazır veriyorsa: Ayarlar > Güvenlik > API Erişimi; güncel doküman 2026-09-22)
//   ILETIMERKEZI_SECRET (panel gizli anahtar veriyorsa; hash burada HMAC-SHA256 ile hesaplanır)
const BASE = 'https://api.iletimerkezi.com/v1';

const STATUS_HINTS: Record<string, string> = {
  '401': 'API anahtarı ya da gizli anahtar hatalı (ya da panelde API erişimi kapalı)',
  '402': 'SMS bakiyesi yetersiz',
  '450': 'Gönderici başlığı onaylı değil ya da yanlış yazılmış',
  '451': 'Aynı mesaj 10 dakika içinde tekrar gönderildi',
  '452': 'Telefon numarası geçersiz',
  '453': 'Mesaj çok uzun',
};

interface SmsState {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastStatusCode: string | null;
  lastError: string | null;
  sentCount: number;
  failedCount: number;
}
const state: SmsState = { lastAttemptAt: null, lastSuccessAt: null, lastStatusCode: null, lastError: null, sentCount: 0, failedCount: 0 };

// Sahte kipte gönderilenler (uçtan uca testler okur).
export const mockOutbox: { phone: string; text: string }[] = [];

function config() {
  const provider = (process.env.SMS_PROVIDER ?? '').trim().toLowerCase();
  const key = (process.env.ILETIMERKEZI_KEY ?? '').trim();
  const secret = (process.env.ILETIMERKEZI_SECRET ?? '').trim();
  const hash = (process.env.ILETIMERKEZI_HASH ?? '').trim();
  const sender = (process.env.ILETIMERKEZI_SENDER ?? '').trim();
  return { provider, key, secret, hash, sender, ready: provider === 'iletimerkezi' && !!key && (!!secret || !!hash) && !!sender };
}

export function isSmsConfigured() {
  const c = config();
  return c.provider === 'mock' || c.ready;
}

function auth(c: ReturnType<typeof config>) {
  // Panelin verdiği hazır hash varsa o kullanılır; yoksa gizli anahtardan hesaplanır.
  return { key: c.key, hash: c.hash || crypto.createHmac('sha256', c.secret).update(c.key).digest('hex') };
}

async function post(path: string, body: unknown): Promise<{ code: string; message: string; json: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const json: any = await res.json().catch(() => null);
  const status = json?.response?.status;
  return { code: String(status?.code ?? res.status), message: String(status?.message ?? ''), json };
}

// "0532..." → "90532..." (normalizePhone çıktısı 0 ile başlar).
function toProviderNumber(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('90')) return digits;
  if (digits.startsWith('0')) return `9${digits}`;
  return `90${digits}`;
}

export type SendSmsResult = { ok: true } | { ok: false; code: string; reason: string };

export async function sendSms(phone: string, text: string): Promise<SendSmsResult> {
  const c = config();
  if (c.provider === 'mock') {
    mockOutbox.push({ phone, text });
    if (mockOutbox.length > 50) mockOutbox.shift();
    return { ok: true };
  }
  if (!c.ready) {
    console.log(`[sms] yapılandırılmamış, gönderilmedi -> ${phone}: ${text}`);
    return { ok: false, code: 'not_configured', reason: 'SMS sağlayıcısı yapılandırılmamış' };
  }
  state.lastAttemptAt = new Date().toISOString();
  try {
    const r = await post('/send-sms/json', {
      request: {
        authentication: auth(c),
        // Doğrulama kodu ticari ileti değildir: İYS sorgusu yapılmaz.
        order: { sender: c.sender, sendDateTime: [], iys: '0', message: { text, receipents: { number: [toProviderNumber(phone)] } } },
      },
    });
    state.lastStatusCode = r.code;
    if (r.code === '200') {
      state.lastSuccessAt = new Date().toISOString();
      state.lastError = null;
      state.sentCount++;
      return { ok: true };
    }
    const reason = STATUS_HINTS[r.code] ?? r.message ?? 'bilinmeyen hata';
    state.lastError = `${r.code}: ${reason}`;
    state.failedCount++;
    console.error(`[sms] gönderilemedi (${r.code}): ${reason}`);
    return { ok: false, code: r.code, reason };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    state.lastStatusCode = 'network';
    state.lastError = `ağ hatası: ${reason}`;
    state.failedCount++;
    console.error('[sms] ağ hatası:', reason);
    return { ok: false, code: 'network', reason };
  }
}

export async function sendOtpSms(phone: string, code: string, lang?: string): Promise<SendSmsResult> {
  if (lang === 'en') return sendSms(phone, `Your Takyon verification code: ${code}. Valid for 5 minutes. Do not share it with anyone.`);
  return sendSms(phone, `Takyon dogrulama kodunuz: ${code}. Kod 5 dakika gecerlidir. Kimseyle paylasmayin.`);
}

// /api/health için: anahtarları sızdırmadan kurulumun doğruluğunu gösterir. Bakiye sorgusu
// anahtar + gizli anahtar doğruysa 200 döner; böylece SMS harcamadan kimlik doğrulanır.
let balanceCache: { at: number; value: { ok: boolean; code: string; smsCredits: number | null; hint: string | null } } | null = null;

export async function smsStatus() {
  const c = config();
  const base = {
    provider: c.provider || null,
    configured: isSmsConfigured(),
    keySet: !!c.key,
    secretSet: !!c.secret,
    hashSet: !!c.hash,
    senderSet: !!c.sender,
    senderLength: c.sender.length,
    senderTooLong: c.sender.length > 11,
    ...state,
  };
  if (!c.ready) return { ...base, account: null };
  if (!balanceCache || Date.now() - balanceCache.at > 60_000) {
    try {
      const r = await post('/get-balance/json', { request: { authentication: auth(c) } });
      const credits = Number(r.json?.response?.balance?.sms);
      balanceCache = { at: Date.now(), value: { ok: r.code === '200', code: r.code, smsCredits: Number.isFinite(credits) ? credits : null, hint: r.code === '200' ? null : STATUS_HINTS[r.code] ?? r.message } };
    } catch (err) {
      balanceCache = { at: Date.now(), value: { ok: false, code: 'network', smsCredits: null, hint: err instanceof Error ? err.message : String(err) } };
    }
  }
  return { ...base, account: balanceCache.value };
}
