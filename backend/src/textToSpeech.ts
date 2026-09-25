import crypto from 'node:crypto';

// Asistanın doğal sesi (Fırat 2026-09-25: "tamam ödeyelim"): Google Cloud Text-to-Speech, Chirp 3 HD
// sesleri (tr-TR destekli). Telefonun kendi sesi bazı cihazlarda robotik ya da sessizdi; sunucu MP3 üretir,
// telefon çalar. Ücret: ayda ilk 1 milyon karakter ücretsiz, sonrası 1M karakter 30 $.
// Kimlik: hizmet hesabı JSON anahtarı (GOOGLE_TTS_CREDENTIALS, Render ortamında; sohbete yazılmaz).
// Anahtar yoksa ya da hata verirse telefon eskisi gibi kendi sesini kullanır.

const TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

// Google tek istekte en çok 5000 bayt kabul ediyor; güvenli pay.
export const MAX_REQUEST_BYTES = 4500;
// Kötüye kullanım/masraf sınırı: kullanıcı başına günlük karakter.
export const DAILY_USER_CHARS = 60_000;

type ServiceAccount = { client_email: string; private_key: string; project_id?: string };

// Panelden yapıştırılan değer: JSON (tek ya da çok satır) veya base64'lü JSON kabul edilir.
function readCredentials(): ServiceAccount | null {
  const raw = process.env.GOOGLE_TTS_CREDENTIALS?.trim();
  if (!raw) return null;
  const tryParse = (s: string) => {
    try {
      const j = JSON.parse(s) as Partial<ServiceAccount>;
      return j.client_email && j.private_key ? (j as ServiceAccount) : null;
    } catch {
      return null;
    }
  };
  return tryParse(raw) ?? tryParse(Buffer.from(raw, 'base64').toString('utf8'));
}

export const isTtsConfigured = () => !!readCredentials();

export function voiceFor(lang: string) {
  if (lang === 'en') return { languageCode: 'en-GB', name: process.env.GOOGLE_TTS_VOICE_EN?.trim() || 'en-GB-Chirp3-HD-Kore' };
  return { languageCode: 'tr-TR', name: process.env.GOOGLE_TTS_VOICE?.trim() || 'tr-TR-Chirp3-HD-Kore' };
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

let token: { value: string; exp: number } | null = null;

async function accessToken(sa: ServiceAccount) {
  if (token && token.exp - 60_000 > Date.now()) return token.value;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const signature = b64url(crypto.sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), sa.private_key.replace(/\\n/g, '\n')));
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${signature}` }),
  });
  const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error_description?: string; error?: string } | null;
  if (!res.ok || !body?.access_token) throw new Error(`Google oturumu açılamadı: ${redact(body?.error_description ?? body?.error ?? `HTTP ${res.status}`)}`);
  token = { value: body.access_token, exp: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return token.value;
}

// Sağlık çıktısı herkese açık: anahtar benzeri parçalar gizlenir.
const redact = (t: string) => t.replace(/[A-Za-z0-9_\-.]{24,}/g, '***').slice(0, 160);

// Aynı metin (ör. aynı cevaba iki kez basılması) yeniden ücretlendirilmesin: küçük bellek önbelleği.
const cache = new Map<string, Buffer>();
const CACHE_MAX = 150;

let lastOkAt: string | null = null;
let lastError: string | null = null;
let charsSinceStart = 0;
const usage = new Map<string, { day: string; chars: number }>();

export class TtsNotConfiguredError extends Error {}
export class TtsLimitError extends Error {}

/** Kullanıcının günlük karakter sınırı; aşılırsa telefon kendi sesine döner. */
export function checkAndCount(userId: string, chars: number) {
  const day = new Date().toISOString().slice(0, 10);
  const u = usage.get(userId);
  const used = u && u.day === day ? u.chars : 0;
  if (used + chars > DAILY_USER_CHARS) throw new TtsLimitError('Günlük sesli okuma sınırı doldu');
  usage.set(userId, { day, chars: used + chars });
}

export async function synthesize(text: string, lang: string): Promise<Buffer> {
  const sa = readCredentials();
  if (!sa) throw new TtsNotConfiguredError('Ses anahtarı girilmemiş');
  const voice = voiceFor(lang);
  const key = crypto.createHash('sha1').update(`${voice.name}|${text}`).digest('hex');
  const hit = cache.get(key);
  if (hit) return hit;
  const res = await fetch(TTS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken(sa)}`, 'Content-Type': 'application/json', ...(sa.project_id ? { 'x-goog-user-project': sa.project_id } : {}) },
    body: JSON.stringify({ input: { text }, voice, audioConfig: { audioEncoding: 'MP3' } }),
  });
  const body = (await res.json().catch(() => null)) as { audioContent?: string; error?: { message?: string } } | null;
  if (!res.ok || !body?.audioContent) {
    lastError = redact(body?.error?.message ?? `HTTP ${res.status}`);
    throw new Error(`Ses üretilemedi: ${lastError}`);
  }
  const audio = Buffer.from(body.audioContent, 'base64');
  lastOkAt = new Date().toISOString();
  lastError = null;
  charsSinceStart += text.length;
  cache.set(key, audio);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return audio;
}

let check: { at: number; ok: boolean; detail?: string } | null = null;

// /api/health: anahtar girilmiş mi, gerçekten ses üretebiliyor mu (kısa metin, 30 dk önbellek), ses adı.
export async function ttsStatus() {
  const sa = readCredentials();
  const raw = process.env.GOOGLE_TTS_CREDENTIALS?.trim();
  if (!sa) return { configured: false, credentialsUnreadable: !!raw, voice: voiceFor('tr').name };
  if (!check || Date.now() - check.at > 30 * 60_000) {
    try {
      await synthesize('Tamam.', 'tr');
      check = { at: Date.now(), ok: true };
    } catch (err) {
      check = { at: Date.now(), ok: false, detail: redact(String((err as Error)?.message ?? err)) };
    }
  }
  return { configured: true, ok: check.ok, detail: check.detail ?? null, voice: voiceFor('tr').name, lastOkAt, lastError, charsSinceStart };
}
