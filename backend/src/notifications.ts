// Uygulama içi bildirimler (Faz 2, Adım 1). Her olay kaynağı yalnızca notify()
// çağırır; kanal (uygulama, ileride push/WhatsApp şablonu) burada çoğalır.
// Bildirim yazımı asıl işlemi ASLA bozmaz: hatalar yutulur ve kayda düşer.
import { prisma } from './db';

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
  | 'invite_joined';

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
}

export interface NotifyInput {
  kind: NotificationKind;
  title: string;
  body?: string;
  data?: NotificationData;
}

export async function notify(userId: string, input: NotifyInput): Promise<void> {
  await notifyMany([userId], input);
}

export async function notifyMany(userIds: readonly string[], input: NotifyInput): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: unique.map((userId) => ({
        userId,
        kind: input.kind,
        title: input.title.slice(0, 120),
        body: (input.body ?? '').slice(0, 300),
        dataJson: JSON.stringify(input.data ?? {}),
      })),
    });
  } catch (err) {
    console.error('[notifications] yazılamadı:', err);
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
