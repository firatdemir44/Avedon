// WhatsApp numara yönetimi (yönetici, 2026-10-05): test numarasından gerçek işletme numarasına
// ortam değişkeni değiştirmeden geçiş. Numara WhatsApp Yöneticisi'nde eklenip SMS/sesli kodla
// doğrulandıktan sonra burada Cloud API'ye kaydedilir (POST /{id}/register, iki adımlı PIN) ve
// aktif yapılır (AppSetting 'whatsapp.phoneNumberId'). PIN ve erişim anahtarı asla yazılmaz/dönmez.
import { prisma } from './db';
import {
  getActivePhoneNumber,
  isWhatsAppMock,
  rerunAccessDiagnostics,
  setActiveDisplayNumber,
  setPhoneNumberOverride,
} from './whatsapp';

export const PHONE_SETTING_KEY = 'whatsapp.phoneNumberId';
const GRAPH = 'https://graph.facebook.com/v21.0';
const FIELDS = 'id,display_phone_number,verified_name,name_status,status,quality_rating,code_verification_status,platform_type,throughput';

export interface WhatsAppNumber {
  id: string;
  displayPhoneNumber: string;
  verifiedName: string | null;
  nameStatus: string | null;
  status: string | null;
  qualityRating: string | null;
  codeVerificationStatus: string | null;
  platformType: string | null;
  throughput: string | null;
  active: boolean;
}

export class MetaError extends Error {
  constructor(message: string, public httpStatus: number) {
    super(message);
  }
}

// Meta cevabındaki uzun anahtar benzeri dizileri gizler (anahtar hiçbir zaman dışarı çıkmaz).
export function redact(text: string, secrets: (string | undefined)[] = []): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join('***');
  return out.replace(/[A-Za-z0-9_-]{40,}/g, '***');
}

function creds() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const wabaId = process.env.WHATSAPP_WABA_ID;
  return { token, wabaId };
}

async function graph(path: string, init: RequestInit = {}, extraSecrets: string[] = []): Promise<Record<string, unknown>> {
  const { token } = creds();
  if (!token) throw new MetaError('WHATSAPP_ACCESS_TOKEN tanımlı değil.', 400);
  const res = await fetch(`${GRAPH}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  if (!res.ok || json.error) {
    const e = (json.error ?? {}) as { message?: string; error_user_title?: string; error_user_msg?: string; code?: number };
    const msg = [e.error_user_title, e.error_user_msg || e.message].filter(Boolean).join(': ') || `Meta ${res.status}`;
    throw new MetaError(redact(`${msg}${e.code ? ` (#${e.code})` : ''}`, [token, ...extraSecrets]), res.status || 502);
  }
  return json;
}

// Açılışta: kayıtlı ayar varsa belleğe al (gönderim yolları senkron okur).
export async function loadActivePhoneNumber(): Promise<void> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: PHONE_SETTING_KEY } });
    setPhoneNumberOverride(row?.value ?? null);
    if (row) console.log('[whatsapp] aktif numara ayardan yüklendi:', row.value);
  } catch (err) {
    console.error('[whatsapp] aktif numara ayarı okunamadı:', (err as Error).message);
  }
}

const MOCK_NUMBERS = [
  { id: 'mock-test-number', display_phone_number: '+1 555-000-0000', verified_name: 'Test Number', name_status: 'APPROVED', status: 'CONNECTED', quality_rating: 'GREEN', code_verification_status: 'VERIFIED', platform_type: 'CLOUD_API', throughput: { level: 'STANDARD' } },
  { id: 'mock-business-number', display_phone_number: '+90 212 000 00 00', verified_name: 'Takyon', name_status: 'PENDING_REVIEW', status: 'PENDING', quality_rating: 'UNKNOWN', code_verification_status: 'VERIFIED', platform_type: 'NOT_APPLICABLE', throughput: { level: 'NOT_APPLICABLE' } },
];

type RawNumber = (typeof MOCK_NUMBERS)[number] & Record<string, unknown>;

export async function listNumbers(): Promise<WhatsAppNumber[]> {
  let raw: RawNumber[];
  if (isWhatsAppMock()) raw = MOCK_NUMBERS as RawNumber[];
  else {
    const { wabaId } = creds();
    if (!wabaId) throw new MetaError('WHATSAPP_WABA_ID tanımlı değil.', 400);
    const json = await graph(`${encodeURIComponent(wabaId)}/phone_numbers?fields=${FIELDS}`);
    raw = (json.data as RawNumber[]) ?? [];
  }
  const activeId = getActivePhoneNumber().id;
  return raw.map((n) => {
    const tp = n.throughput as unknown;
    return {
      id: String(n.id),
      displayPhoneNumber: String(n.display_phone_number ?? ''),
      verifiedName: (n.verified_name as string) ?? null,
      nameStatus: (n.name_status as string) ?? null,
      status: (n.status as string) ?? null,
      qualityRating: (n.quality_rating as string) ?? null,
      codeVerificationStatus: (n.code_verification_status as string) ?? null,
      platformType: (n.platform_type as string) ?? null,
      throughput: tp && typeof tp === 'object' ? ((tp as { level?: string }).level ?? null) : ((tp as string) ?? null),
      active: String(n.id) === activeId,
    };
  });
}

export async function registerNumber(id: string, pin: string): Promise<Record<string, unknown>> {
  if (isWhatsAppMock()) return { success: true };
  return graph(`${encodeURIComponent(id)}/register`, { method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', pin }) }, [pin]);
}

export async function activateNumber(id: string): Promise<{ diagnostics: string[] }> {
  // Numara bu WABA'da mı? Yanlış kimlikle gönderim tamamen durmasın.
  const numbers = await listNumbers();
  const found = numbers.find((n) => n.id === id);
  if (!found) throw new MetaError('Bu numara WhatsApp işletme hesabında bulunamadı.', 404);
  await prisma.appSetting.upsert({ where: { key: PHONE_SETTING_KEY }, create: { key: PHONE_SETTING_KEY, value: id }, update: { value: id } });
  setPhoneNumberOverride(id);
  setActiveDisplayNumber(found.displayPhoneNumber || null);
  console.log('[whatsapp] aktif numara değişti:', id);
  return { diagnostics: await rerunAccessDiagnostics() };
}
