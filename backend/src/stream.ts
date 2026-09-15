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
// `cloudflare_error`: 429/5xx gibi hesap/anahtarla ilgisi olmayan yanıtlar —
// önceki sürüm bunları da "invalid_account" sayıyordu, yanlış teşhise yol açar.
export type StreamAccess =
  | 'not_configured'
  | 'ok'
  | 'unauthorized'
  | 'invalid_account'
  | 'cloudflare_error'
  | 'unreachable';

// Teşhis için; hiçbiri gizli değil: değerlerin KENDİSİ değil yalnızca biçimi,
// ve Cloudflare'in hata kodu/mesajı (anahtar içermez).
export interface StreamAccessReport {
  access: StreamAccess;
  httpStatus: number | null;
  cloudflareErrors: string[];
  accountIdShape: { length: number; hex32: boolean } | null;
  tokenLength: number | null;
}

const ACCESS_OK_TTL_MS = 10 * 60 * 1000;
const ACCESS_FAIL_TTL_MS = 60 * 1000;
let accessCache: { report: StreamAccessReport; key: string; expiresAt: number } | null = null;

export async function checkStreamAccess(): Promise<StreamAccessReport> {
  const cfg = config();
  if (!cfg) {
    return { access: 'not_configured', httpStatus: null, cloudflareErrors: [], accountIdShape: null, tokenLength: null };
  }

  // Değerler değişirse eski sonuç kullanılmasın.
  const key = `${cfg.accountId}:${cfg.token.length}`;
  if (accessCache && accessCache.key === key && accessCache.expiresAt > Date.now()) {
    return accessCache.report;
  }

  const shape = {
    accountIdShape: { length: cfg.accountId.length, hex32: /^[0-9a-f]{32}$/.test(cfg.accountId) },
    tokenLength: cfg.token.length,
  };

  let report: StreamAccessReport;
  try {
    const { status, data } = await call<unknown>('GET', '?limit=1');
    const cloudflareErrors = (data?.errors ?? []).map((e) => `${e.code ?? ''} ${e.message ?? ''}`.trim());
    let access: StreamAccess;
    if (status === 200) access = 'ok';
    else if (status === 401 || status === 403) access = 'unauthorized';
    else if (status === 400 || status === 404) access = 'invalid_account';
    else access = 'cloudflare_error';
    report = { access, httpStatus: status, cloudflareErrors, ...shape };
  } catch {
    report = { access: 'unreachable', httpStatus: null, cloudflareErrors: [], ...shape };
  }

  accessCache = {
    report,
    key,
    expiresAt: Date.now() + (report.access === 'ok' ? ACCESS_OK_TTL_MS : ACCESS_FAIL_TTL_MS),
  };
  return report;
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
