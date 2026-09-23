// Asistana sesli soru (2026-09-23): tarayıcının kendi konuşma tanıması telefonda 1-2 sn'de
// kendiliğinden kapanıyordu. Yeni yol: telefon sesi kaydeder (kullanıcı durdurana kadar),
// sunucu Cloudflare Workers AI üzerindeki Whisper ile yazıya çevirir.
// Ücret: günde 10.000 "neuron" ücretsiz (~200 dk ses); aşımda dakikası ~0,0005 $.
// Anahtar: CLOUDFLARE_AI_TOKEN ("Workers AI" izinli token), hesap: CLOUDFLARE_ACCOUNT_ID.

const API_BASE = process.env.CLOUDFLARE_API_BASE || 'https://api.cloudflare.com/client/v4';
const MODEL = '@cf/openai/whisper-large-v3-turbo';

const creds = () => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_AI_TOKEN?.trim();
  return accountId && token ? { accountId, token } : null;
};

export const isSpeechConfigured = () => !!creds();

export class SpeechNotConfiguredError extends Error {}

export async function transcribe(audio: Buffer): Promise<string> {
  const c = creds();
  if (!c) throw new SpeechNotConfiguredError('Ses tanıma anahtarı girilmemiş');
  const res = await fetch(`${API_BASE}/accounts/${c.accountId}/ai/run/${MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio: audio.toString('base64'),
      task: 'transcribe',
      language: 'tr',
      vad_filter: true,
      initial_prompt: 'Tekstil: kumaş, iplik, elastan, penye, süprem, gramaj, numune, GTİP, ihracat.',
    }),
  });
  const body = (await res.json().catch(() => null)) as { success?: boolean; result?: { text?: string }; errors?: { message: string }[] } | null;
  if (!res.ok || !body?.success) {
    lastError = body?.errors?.[0]?.message ?? `HTTP ${res.status}`;
    throw new Error(`Ses yazıya çevrilemedi: ${lastError}`);
  }
  lastOkAt = new Date().toISOString();
  lastError = null;
  return (body.result?.text ?? '').trim();
}

let lastOkAt: string | null = null;
let lastError: string | null = null;
let tokenCheck: { at: number; ok: boolean; detail?: string } | null = null;

// /api/health için: anahtar girilmiş mi, token geçerli mi (10 dk önbellek), son başarı/hata.
export async function speechStatus() {
  const c = creds();
  if (!c) return { configured: false };
  if (!tokenCheck || Date.now() - tokenCheck.at > 600_000) {
    try {
      // Hesap-kapsamlı token hem /user hem /accounts doğrulamasını destekler; biri yeterli.
      const tries = [`${API_BASE}/accounts/${c.accountId}/tokens/verify`, `${API_BASE}/user/tokens/verify`];
      let ok = false;
      let detail: string | undefined;
      for (const u of tries) {
        const r = await fetch(u, { headers: { Authorization: `Bearer ${c.token}` } });
        const b = (await r.json().catch(() => null)) as { success?: boolean; result?: { status?: string }; errors?: { message: string }[] } | null;
        if (b?.success && b.result?.status === 'active') {
          ok = true;
          break;
        }
        detail = b?.errors?.[0]?.message ?? `HTTP ${r.status}`;
      }
      tokenCheck = { at: Date.now(), ok, detail: ok ? undefined : detail };
    } catch (err) {
      tokenCheck = { at: Date.now(), ok: false, detail: (err as Error).message };
    }
  }
  return { configured: true, tokenActive: tokenCheck.ok, tokenDetail: tokenCheck.detail, lastOkAt, lastError };
}
