// Uygulama içi bildirimler (Faz 2, Adım 1). Her olay kaynağı yalnızca notify()
// çağırır; kanal (uygulama, ileride push/WhatsApp şablonu) burada çoğalır.
// Bildirim yazımı asıl işlemi ASLA bozmaz: hatalar yutulur ve kayda düşer.
import { prisma } from './db';
import { sendPush } from './push';
import { normalizeLang, t, type Lang } from './i18n';

export type NotificationKind =
  | 'sample_request_new'
  | 'sample_request_status'
  | 'connection_request'
  | 'connection_accepted'
  | 'watch_match'
  | 'quote_request_new'
  | 'quote_received'
  | 'quote_accepted'
  | 'quote_declined'
  | 'company_question_new'
  | 'company_question_answered'
  | 'reference_request'
  | 'reference_confirmed'
  | 'reference_rejected'
  | 'deal_created'
  | 'deal_delivered'
  | 'deal_confirmed'
  | 'deal_disputed'
  | 'deal_cancelled'
  | 'deal_review'
  | 'product_draft'
  | 'invite_joined'
  | 'verification_request'
  | 'verification_approved'
  | 'verification_rejected'
  | 'tender_new'
  | 'tender_offer'
  | 'tender_awarded'
  | 'tender_closed'
  | 'feed_moderation'
  | 'assistant_digest';

export interface NotificationData {
  productId?: string;
  sampleRequestId?: string;
  userId?: string;
  ruleId?: string;
  postId?: string;
  quoteRequestId?: string;
  questionId?: string;
  threadId?: string;
  companyId?: string;
  referenceId?: string;
  dealId?: string;
  draftId?: string;
  inviteId?: string;
  verificationRequestId?: string;
  tenderId?: string;
}

export interface NotifyInput {
  kind: NotificationKind;
  /** Türkçe metin = çeviri anahtarı; `{ad}` yer tutucuları `vars` ile doldurulur. */
  title: string;
  body?: string;
  vars?: Record<string, string | number>;
  /** Gövde kullanıcı yazısıysa (soru, not) çevrilmez ve yer tutucu uygulanmaz. */
  rawBody?: boolean;
  /** Değeri de çevrilecek değişkenler (ör. durum etiketi). */
  translateVars?: string[];
  /** Metin parça parça kuruluyorsa: dile göre başlık/gövde üreten işlev (title/body yerine geçer). */
  localize?: (lang: Lang) => { title: string; body?: string };
  data?: NotificationData;
}

/** Bildirim metnini alıcının diline çevirir. */
export function localizeNotification(lang: Lang, input: NotifyInput): { title: string; body: string } {
  if (input.localize) {
    const m = input.localize(lang);
    return { title: m.title, body: m.body ?? '' };
  }
  let vars = input.vars;
  if (vars && input.translateVars?.length) {
    vars = { ...vars };
    for (const k of input.translateVars) if (typeof vars[k] === 'string') vars[k] = t(lang, vars[k] as string);
  }
  const title = t(lang, input.title, vars);
  const body = input.rawBody ? input.body ?? '' : input.body ? t(lang, input.body, vars) : '';
  return { title, body };
}

async function languagesOf(userIds: readonly string[]): Promise<Map<string, Lang>> {
  const map = new Map<string, Lang>();
  try {
    const rows = await prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, language: true } });
    for (const r of rows) map.set(r.id, normalizeLang(r.language));
  } catch {
    /* dil bilinmiyorsa Türkçe */
  }
  return map;
}

export async function notify(userId: string, input: NotifyInput): Promise<void> {
  await notifyMany([userId], input);
}

export async function notifyMany(userIds: readonly string[], input: NotifyInput): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  const langs = await languagesOf(unique);
  const langOf = (id: string): Lang => langs.get(id) ?? 'tr';
  try {
    await prisma.notification.createMany({
      data: unique.map((userId) => {
        const m = localizeNotification(langOf(userId), input);
        return { userId, kind: input.kind, title: m.title.slice(0, 120), body: m.body.slice(0, 300), dataJson: JSON.stringify(input.data ?? {}) };
      }),
    });
  } catch (err) {
    console.error('[notifications] yazılamadı:', err);
  }
  // Anlık bildirim: her dil grubuna kendi metni. Beklenmez, hatası bildirimi bozmaz.
  for (const lang of ['tr', 'en'] as const) {
    const ids = unique.filter((id) => langOf(id) === lang);
    if (!ids.length) continue;
    const m = localizeNotification(lang, input);
    void sendPush(ids, { title: m.title, body: m.body, kind: input.kind, data: input.data as Record<string, unknown> | undefined });
  }
}

export function toNotificationRow(row: { id: string; kind: string; title: string; body: string; dataJson: string; readAt: Date | null; createdAt: Date }) {
  let data: NotificationData = {};
  try {
    data = JSON.parse(row.dataJson);
  } catch {
    data = {};
  }
  return { id: row.id, kind: row.kind, title: row.title, body: row.body, data, read: row.readAt != null, createdAt: row.createdAt };
}
