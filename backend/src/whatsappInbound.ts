// Gelen WhatsApp mesajlarının işlenmesi (Faz 1, Adım 7): yük ayrıştırma,
// tekrar koruması (messageId), göndereni bulma, asistanı whatsapp kanalında
// çalıştırma ve cevabı gönderme. Rota (routes/whatsappWebhook.ts) 200'ü hemen
// döner, bu dosyadaki işlem arka planda koşar.
import { prisma } from './db';
import { runAssistantTurn } from './assistant/run';
import { LlmNotConfiguredError, isLlmConfigured } from './llm';
import { phoneCandidatesFromWhatsApp } from './phone';
import { normalizeLang, t, type Lang } from './i18n';
import { downloadWhatsAppMedia, getActivePhoneNumber, markIgnoredOtherNumber, markInbound, sendWhatsAppText } from './whatsapp';
import { notify } from './notifications';
import { runPassportExtract, type ImageMediaType } from './skills/passportExtract';
import { SUBTYPES, TYPE_LABELS, type ProductType } from './catalog';
import { formatComposition } from './domain/glossary';

export interface InboundText {
  messageId: string;
  from: string; // E.164 rakamları, ör. 905321234567
  body: string;
  type: string; // text | image | ...
  timestamp: Date | null;
  // Fotoğraf mesajında: Meta medya kimliği ve (varsa) fotoğrafın altına yazılan not.
  mediaId?: string;
  caption?: string;
  // Mesajın geldiği işletme numarası (value.metadata.phone_number_id); yoksa undefined.
  toPhoneNumberId?: string;
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
      const value = (change as { field?: string; value?: { messages?: unknown[]; metadata?: { phone_number_id?: string } } })?.value;
      const toPhoneNumberId = value?.metadata?.phone_number_id ? String(value.metadata.phone_number_id) : undefined;
      const messages = value?.messages;
      if (!Array.isArray(messages)) continue;
      for (const m of messages) {
        const msg = m as { id?: string; from?: string; type?: string; timestamp?: string; text?: { body?: string }; image?: { id?: string; caption?: string } };
        if (!msg?.id || !msg.from) continue;
        const ts = msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : null;
        out.push({
          messageId: msg.id,
          from: String(msg.from).replace(/\D/g, ''),
          body: (msg.text?.body ?? '').trim(),
          type: msg.type ?? 'unknown',
          ...(msg.type === 'image' && msg.image?.id ? { mediaId: msg.image.id, caption: (msg.image.caption ?? '').trim() } : {}),
          timestamp: ts && !Number.isNaN(ts.getTime()) ? ts : null,
          ...(toPhoneNumberId ? { toPhoneNumberId } : {}),
        });
      }
    }
  }
  return out;
}

export const REPLY_UNKNOWN_USER =
  'Merhaba, ben Takyon asistanı. Bu numara Takyon\'da kayıtlı değil. Uygulamaya aynı numarayla kayıt olursanız buradan hesap sorabilir, etiket metni gönderebilir ve kataloğunuzu sorabilirsiniz.';
export const REPLY_NON_TEXT =
  "WhatsApp'tan yazılı mesaj ve etiket FOTOĞRAFI okuyabiliyorum. Ses, video ve belge şimdilik okunmuyor; etiket metnini yazarsanız onu da okurum.";
export const REPLY_PHOTO_NO_COMPANY = 'Fotoğraftan ürün taslağı hazırlayabilmem için uygulamada bir firmaya bağlı olmanız gerekiyor.';
export const REPLY_PHOTO_UNREADABLE =
  'Fotoğrafta okunabilir bir etiket bulamadım. Etiketi yakından, düz ve iyi ışıkta çekip yeniden gönderin; isterseniz etiketteki bilgileri yazı olarak da gönderebilirsiniz.';
export const REPLY_PHOTO_FAILED = 'Fotoğrafı indiremedim ya da okuyamadım. Lütfen yeniden gönderin.';
export const REPLY_ASSISTANT_DOWN = 'Asistan şu an yanıt veremiyor, biraz sonra tekrar deneyin. Uygulamadaki hesaplayıcılar çalışıyor.';
export const REPLY_FAILED = 'Bir sorun oldu, mesajınızı işleyemedim. Lütfen tekrar deneyin.';

const MAX_WHATSAPP_REPLY = 3500;

// WhatsApp'ta kart yok: araç özetleri ve hafıza önerileri metnin altına eklenir.
export function composeWhatsAppReply(turn: {
  message: { text: string; toolCalls: { title: string; summary: string }[]; memorySuggestions: { label: string; value: unknown }[]; watchSuggestions?: { name: string }[] };
}, lang: Lang = 'tr') {
  const lines: string[] = [turn.message.text.trim()];
  for (const c of turn.message.toolCalls) lines.push(`\n${c.title}: ${c.summary}`);
  if (turn.message.memorySuggestions.length) {
    const items = turn.message.memorySuggestions.map((s) => `${s.label} = ${String(s.value)}`).join(', ');
    lines.push('\n' + t(lang, 'Hafızaya kaydetmek için uygulamadaki Asistan sekmesinden onaylayın: {items}.', { items }));
  }
  if (turn.message.watchSuggestions?.length) {
    lines.push('\n' + t(lang, 'İzleme kuralını kurmak için uygulamadaki Asistan sekmesinden onaylayın: {items}.', { items: turn.message.watchSuggestions.map((w) => w.name).join('; ') }));
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

  // Hazır cevaplar kullanıcının kayıtlı dilinde (tanınmayan numara: Türkçe).
  let lang: Lang = 'tr';
  const finish = async (status: string, replyBody: string, extra: { userId?: string; threadId?: string; error?: string } = {}) => {
    if (status !== 'answered' && status !== 'draft_created') replyBody = t(lang, replyBody);
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
  lang = normalizeLang(user.language);

  // Etiket fotoğrafı → ürün TASLAĞI (ürün oluşturmaz; kullanıcı uygulamada kontrol edip kaydeder).
  if (msg.type === 'image' && msg.mediaId) {
    if (!user.companyId) return finish('photo_no_company', REPLY_PHOTO_NO_COMPANY, { userId: user.id });
    if (!isLlmConfigured()) return finish('assistant_unavailable', REPLY_ASSISTANT_DOWN, { userId: user.id });
    try {
      const media = await downloadWhatsAppMedia(msg.mediaId);
      const mediaType = (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(media.mediaType) ? media.mediaType : 'image/jpeg') as ImageMediaType;
      const outcome = await runPassportExtract({ images: [{ data: media.data, mediaType }], document: null, text: msg.caption || null, hints: {} });
      const summary = draftSummary(outcome.extraction);
      if (!summary) return finish('photo_unreadable', REPLY_PHOTO_UNREADABLE, { userId: user.id });
      const draft = await prisma.productDraft.create({
        data: { userId: user.id, companyId: user.companyId, source: 'whatsapp', imageUrl: `data:${mediaType};base64,${media.data}`, caption: msg.caption ?? '', extractionJson: JSON.stringify(outcome) },
      });
      await notify(user.id, { kind: 'product_draft', title: "WhatsApp'tan ürün taslağı hazır", body: summary, rawBody: true, data: { draftId: draft.id } });
      return finish(
        'draft_created',
        t(lang, "Etiketi okudum: {summary}.\n\nTaslak uygulamada hazır: Bildirimler'den açın, bilgileri kontrol edip kaydedin. Fiyat ve stok etiketten alınmaz, onları siz girersiniz.", { summary }),
        { userId: user.id }
      );
    } catch (err) {
      console.error('[whatsapp] fotoğraf işlenemedi:', err);
      return finish('photo_failed', err instanceof LlmNotConfiguredError ? REPLY_ASSISTANT_DOWN : REPLY_PHOTO_FAILED, { userId: user.id, error: (err as Error).message?.slice(0, 500) });
    }
  }

  if (msg.type !== 'text' || !msg.body) return finish('non_text', REPLY_NON_TEXT, { userId: user.id });

  if (!isLlmConfigured()) return finish('assistant_unavailable', REPLY_ASSISTANT_DOWN, { userId: user.id });

  const thread = await findOrCreateWhatsAppThread(user.id, user.companyId ?? null);
  try {
    const turn = await runAssistantTurn({ threadId: thread.id, userId: user.id, companyId: user.companyId ?? null, text: msg.body });
    return finish('answered', composeWhatsAppReply(turn, lang), { userId: user.id, threadId: thread.id });
  } catch (err) {
    console.error('[whatsapp] asistan hatası:', err);
    const reply = err instanceof LlmNotConfiguredError ? REPLY_ASSISTANT_DOWN : REPLY_FAILED;
    return finish('failed', reply, { userId: user.id, threadId: thread.id, error: (err as Error).message?.slice(0, 500) });
  }
}

// Aynı WABA'daki başka bir numaraya (ör. eski test numarası) gelen mesajlar işlenmez, yalnızca
// kayda geçer: cevap aktif numaradan gideceği için karışıklık olmasın. Numara bilgisi yoksa kabul.
export function filterForActiveNumber(messages: InboundText[]): InboundText[] {
  const active = getActivePhoneNumber().id;
  return messages.filter((m) => {
    if (!active || !m.toPhoneNumberId || m.toPhoneNumberId === active) return true;
    markIgnoredOtherNumber();
    console.log('[whatsapp] aktif olmayan numaraya gelen mesaj atlandı:', m.toPhoneNumberId, m.messageId);
    return false;
  });
}

export async function handleWebhookPayload(payload: unknown) {
  const messages = filterForActiveNumber(parseInboundMessages(payload));
  for (const msg of messages) {
    try {
      await handleInbound(msg);
    } catch (err) {
      console.error('[whatsapp] gelen mesaj işlenemedi:', msg.messageId, err);
    }
  }
  return messages.length;
}

// WhatsApp cevabı ve bildirim için kısa özet: yalnızca OKUNAN alanlar. Hiçbir şey okunmadıysa boş döner.
function draftSummary(x: Awaited<ReturnType<typeof runPassportExtract>>['extraction']): string {
  const parts: string[] = [];
  if (x.code.value) parts.push(x.code.value);
  const type = x.type.value as ProductType | null;
  const subtype = type && x.subtype.value ? (SUBTYPES[type] ?? []).find((o) => o.key === x.subtype.value)?.label : null;
  if (subtype) parts.push(subtype);
  else if (type) parts.push(TYPE_LABELS[type] ?? type);
  if (x.composition.value?.length) parts.push(formatComposition(x.composition.value));
  if (x.weightGsm.value) parts.push(`${String(x.weightGsm.value).replace('.', ',')} gr/m²`);
  if (x.widthCm.value) parts.push(`${String(x.widthCm.value).replace('.', ',')} cm`);
  if (x.certificates.value?.length) parts.push(x.certificates.value.map((c) => c.name).join(', '));
  return parts.join(' · ');
}
