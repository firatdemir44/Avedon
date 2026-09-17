// Gelen WhatsApp mesajlarının işlenmesi (Faz 1, Adım 7): yük ayrıştırma,
// tekrar koruması (messageId), göndereni bulma, asistanı whatsapp kanalında
// çalıştırma ve cevabı gönderme. Rota (routes/whatsappWebhook.ts) 200'ü hemen
// döner, bu dosyadaki işlem arka planda koşar.
import { prisma } from './db';
import { runAssistantTurn } from './assistant/run';
import { LlmNotConfiguredError, isLlmConfigured } from './llm';
import { phoneCandidatesFromWhatsApp } from './phone';
import { markInbound, sendWhatsAppText } from './whatsapp';

export interface InboundText {
  messageId: string;
  from: string; // E.164 rakamları, ör. 905321234567
  body: string;
  type: string; // text | image | ...
  timestamp: Date | null;
}

// Meta yükü: entry[].changes[].value.messages[]; durum bildirimleri (statuses)
// ve diğer alanlar atlanır. Bilinmeyen biçim boş liste verir, hata fırlatmaz.
export function parseInboundMessages(payload: unknown): InboundText[] {
  const out: InboundText[] = [];
  const entries = (payload as { entry?: unknown[] } | null)?.entry;
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { field?: string; value?: { messages?: unknown[] } })?.value;
      const messages = value?.messages;
      if (!Array.isArray(messages)) continue;
      for (const m of messages) {
        const msg = m as { id?: string; from?: string; type?: string; timestamp?: string; text?: { body?: string } };
        if (!msg?.id || !msg.from) continue;
        const ts = msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : null;
        out.push({
          messageId: msg.id,
          from: String(msg.from).replace(/\D/g, ''),
          body: (msg.text?.body ?? '').trim(),
          type: msg.type ?? 'unknown',
          timestamp: ts && !Number.isNaN(ts.getTime()) ? ts : null,
        });
      }
    }
  }
  return out;
}

export const REPLY_UNKNOWN_USER =
  'Merhaba, ben Avedon asistanı. Bu numara Avedon\'da kayıtlı değil. Uygulamaya aynı numarayla kayıt olursanız buradan hesap sorabilir, etiket metni gönderebilir ve kataloğunuzu sorabilirsiniz.';
export const REPLY_NON_TEXT =
  'Şimdilik WhatsApp\'tan yalnızca yazılı mesaj okuyabiliyorum. Etiket fotoğrafını uygulamada "Etiketten doldur" ile okutabilirsiniz; buradan etiket metnini yazarsanız onu da okurum.';
export const REPLY_ASSISTANT_DOWN = 'Asistan şu an yanıt veremiyor, biraz sonra tekrar deneyin. Uygulamadaki hesaplayıcılar çalışıyor.';
export const REPLY_FAILED = 'Bir sorun oldu, mesajınızı işleyemedim. Lütfen tekrar deneyin.';

const MAX_WHATSAPP_REPLY = 3500;

// WhatsApp'ta kart yok: araç özetleri ve hafıza önerileri metnin altına eklenir.
export function composeWhatsAppReply(turn: {
  message: { text: string; toolCalls: { title: string; summary: string }[]; memorySuggestions: { label: string; value: unknown }[]; watchSuggestions?: { name: string }[] };
}) {
  const lines: string[] = [turn.message.text.trim()];
  for (const c of turn.message.toolCalls) lines.push(`\n${c.title}: ${c.summary}`);
  if (turn.message.memorySuggestions.length) {
    const items = turn.message.memorySuggestions.map((s) => `${s.label} = ${String(s.value)}`).join(', ');
    lines.push(`\nHafızaya kaydetmek için uygulamadaki Asistan sekmesinden onaylayın: ${items}.`);
  }
  if (turn.message.watchSuggestions?.length) {
    lines.push(`\nİzleme kuralını kurmak için uygulamadaki Asistan sekmesinden onaylayın: ${turn.message.watchSuggestions.map((w) => w.name).join('; ')}.`);
  }
  const text = lines.join('\n').trim();
  return text.length > MAX_WHATSAPP_REPLY ? `${text.slice(0, MAX_WHATSAPP_REPLY - 1)}…` : text;
}

async function findOrCreateWhatsAppThread(userId: string, companyId: string | null) {
  const existing = await prisma.assistantThread.findFirst({ where: { userId, channel: 'whatsapp' }, orderBy: { updatedAt: 'desc' } });
  if (existing) return existing;
  return prisma.assistantThread.create({ data: { userId, companyId, channel: 'whatsapp', title: 'WhatsApp' } });
}

// Tek bir gelen mesaj. Sonuç: veritabanındaki WhatsAppInbound satırı (durum ve
// gönderilen cevapla). Aynı messageId ikinci kez gelirse hiçbir şey yapılmaz.
export async function handleInbound(msg: InboundText): Promise<{ status: string; duplicate: boolean }> {
  markInbound();
  try {
    await prisma.whatsAppInbound.create({
      data: { messageId: msg.messageId, fromPhone: msg.from, body: msg.body, type: msg.type, status: 'received', receivedAt: msg.timestamp ?? new Date() },
    });
  } catch (err) {
    // @@unique(messageId): Meta aynı mesajı yeniden gönderdi.
    if ((err as { code?: string })?.code === 'P2002') return { status: 'duplicate', duplicate: true };
    throw err;
  }

  const finish = async (status: string, replyBody: string, extra: { userId?: string; threadId?: string; error?: string } = {}) => {
    if (replyBody) {
      try {
        await sendWhatsAppText(msg.from, replyBody);
      } catch (err) {
        status = 'send_failed';
        extra.error = `${extra.error ? extra.error + '; ' : ''}${(err as Error).message}`;
      }
    }
    await prisma.whatsAppInbound.update({
      where: { messageId: msg.messageId },
      data: { status, replyBody, userId: extra.userId ?? null, threadId: extra.threadId ?? null, error: extra.error ?? '', processedAt: new Date() },
    });
    return { status, duplicate: false };
  };

  const user = await prisma.user.findFirst({ where: { phone: { in: phoneCandidatesFromWhatsApp(msg.from) } } });
  if (!user) return finish('unknown_user', REPLY_UNKNOWN_USER);

  if (msg.type !== 'text' || !msg.body) return finish('non_text', REPLY_NON_TEXT, { userId: user.id });

  if (!isLlmConfigured()) return finish('assistant_unavailable', REPLY_ASSISTANT_DOWN, { userId: user.id });

  const thread = await findOrCreateWhatsAppThread(user.id, user.companyId ?? null);
  try {
    const turn = await runAssistantTurn({ threadId: thread.id, userId: user.id, companyId: user.companyId ?? null, text: msg.body });
    return finish('answered', composeWhatsAppReply(turn), { userId: user.id, threadId: thread.id });
  } catch (err) {
    console.error('[whatsapp] asistan hatası:', err);
    const reply = err instanceof LlmNotConfiguredError ? REPLY_ASSISTANT_DOWN : REPLY_FAILED;
    return finish('failed', reply, { userId: user.id, threadId: thread.id, error: (err as Error).message?.slice(0, 500) });
  }
}

export async function handleWebhookPayload(payload: unknown) {
  const messages = parseInboundMessages(payload);
  for (const msg of messages) {
    try {
      await handleInbound(msg);
    } catch (err) {
      console.error('[whatsapp] gelen mesaj işlenemedi:', msg.messageId, err);
    }
  }
  return messages.length;
}
