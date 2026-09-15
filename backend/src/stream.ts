// Cloudflare Stream API istemcisi. Uç yolları ve alan adları resmi dokümandan
// (developers.cloudflare.com/stream ve /api/resources/stream):
//   POST   /accounts/{id}/stream/direct_upload   -> result.uploadURL, result.uid   (Stream Write)
//   GET    /accounts/{id}/stream/{uid}            -> readyToStream, status.state,
//                                                    duration, playback.hls         (Stream Read)
//   POST   /accounts/{id}/stream/{uid}/token      -> imzalı oynatma anahtarı (varsayılan 1 saat)
//   DELETE /accounts/{id}/stream/{uid}
// /token yanıtında anahtar `result.token` alanında (API referansından doğrulandı,
// 2026-09-14). Yine de gelmezse açık hata atılıyor, sessizce yanlış adres
// üretilmiyor.
const API_BASE = process.env.CLOUDFLARE_API_BASE || 'https://api.cloudflare.com/client/v4';
const REQUEST_TIMEOUT_MS = 15000;

function config() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN?.trim();
  return accountId && token ? { accountId, token } : null;
}

export function isStreamConfigured() {
  return config() !== null;
}

export class StreamApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'StreamApiError';
  }
}

type Envelope<T> = {
  success?: boolean;
  errors?: { code?: number; message?: string }[];
  result?: T;
};

async function call<T>(method: string, path: string, body?: unknown) {
  const cfg = config();
  if (!cfg) throw new StreamApiError(503, 'stream_not_configured');

  const res = await fetch(`${API_BASE}/accounts/${cfg.accountId}/stream${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  let data: Envelope<T> | null = null;
  try {
    data = (await res.json()) as Envelope<T>;
  } catch {
    // DELETE gövdesiz dönebilir.
  }
  return { status: res.status, data };
}

// /api/health için: anahtarlar yalnızca GİRİLMİŞ mi değil, Cloudflare'de gerçekten
// ÇALIŞIYOR mu. Video listesinden tek kayıt istemek hem Account ID'yi hem de
// anahtarın Stream iznini tek istekte doğrular. Sonuç önbellekte: başarı 10 dk,
// hata 1 dk (anahtar düzeltilince durum sayfası hızla güncellensin). Hata fırlatmaz.
export type StreamAccess = 'not_configured' | 'ok' | 'unauthorized' | 'invalid_account' | 'unreachable';

const ACCESS_OK_TTL_MS = 10 * 60 * 1000;
const ACCESS_FAIL_TTL_MS = 60 * 1000;
let accessCache: { value: StreamAccess; key: string; expiresAt: number } | null = null;

export async function checkStreamAccess(): Promise<StreamAccess> {
  const cfg = config();
  if (!cfg) return 'not_configured';

  // Değerler değişirse (yeni yayın zaten süreci yeniler ama yine de) eski sonuç kullanılmasın.
  const key = `${cfg.accountId}:${cfg.token.length}`;
  if (accessCache && accessCache.key === key && accessCache.expiresAt > Date.now()) {
    return accessCache.value;
  }

  let value: StreamAccess;
  try {
    const { status } = await call<unknown>('GET', '?limit=1');
    if (status === 200) value = 'ok';
    else if (status === 401 || status === 403) value = 'unauthorized';
    else value = 'invalid_account'; // 400/404: Account ID biçimi yanlış ya da hesap yok
  } catch {
    value = 'unreachable';
  }

  accessCache = { value, key, expiresAt: Date.now() + (value === 'ok' ? ACCESS_OK_TTL_MS : ACCESS_FAIL_TTL_MS) };
  return value;
}

function failure(status: number, data: Envelope<unknown> | null, context: string): never {
  // Anahtar asla loglanmıyor; yalnızca Cloudflare'in hata mesajları.
  const messages = (data?.errors ?? []).map((e) => `${e.code ?? ''} ${e.message ?? ''}`.trim()).join('; ');
  throw new StreamApiError(status, `${context} failed (${status})${messages ? `: ${messages}` : ''}`);
}

export async function createDirectUpload(input: { maxDurationSeconds: number; meta: Record<string, string> }) {
  const { status, data } = await call<{ uploadURL?: string; uid?: string }>('POST', '/direct_upload', {
    maxDurationSeconds: input.maxDurationSeconds,
    requireSignedURLs: true,
    meta: input.meta,
  });
  if (status >= 300 || !data?.result?.uploadURL || !data.result.uid) {
    failure(status, data, 'direct_upload');
  }
  return { uploadURL: data.result.uploadURL, uid: data.result.uid };
}

export type StreamVideoState =
  | 'pendingupload'
  | 'downloading'
  | 'queued'
  | 'inprogress'
  | 'ready'
  | 'error'
  | 'live-inprogress';

export async function getStreamVideo(uid: string) {
  const { status, data } = await call<{
    readyToStream?: boolean;
    status?: { state?: StreamVideoState; errorReasonCode?: string };
    duration?: number;
    playback?: { hls?: string };
  }>('GET', `/${encodeURIComponent(uid)}`);

  if (status === 404) return null;
  if (status >= 300 || !data?.result) failure(status, data, 'get_video');

  const result = data.result;
  let playbackHost = '';
  if (result.playback?.hls) {
    try {
      playbackHost = new URL(result.playback.hls).host;
    } catch {
      playbackHost = '';
    }
  }

  return {
    state: result.status?.state ?? 'queued',
    // Oynatma adresi kurulamıyorsa hazır sayılmıyor.
    readyToStream: result.readyToStream === true && playbackHost !== '',
    durationSeconds: typeof result.duration === 'number' ? result.duration : -1,
    errorReasonCode: result.status?.errorReasonCode ?? '',
    playbackHost,
  };
}

export async function createPlaybackToken(uid: string) {
  const { status, data } = await call<{ token?: string }>('POST', `/${encodeURIComponent(uid)}/token`, {});
  if (status >= 300) failure(status, data, 'create_token');
  const token = data?.result?.token;
  if (!token) {
    const keys = data?.result ? Object.keys(data.result).join(',') : 'none';
    throw new StreamApiError(502, `create_token: result.token missing (result keys: ${keys})`);
  }
  return token;
}

export async function deleteStreamVideo(uid: string) {
  const { status, data } = await call<unknown>('DELETE', `/${encodeURIComponent(uid)}`);
  if (status === 404) return;
  if (status >= 300) failure(status, data, 'delete_video');
}
