import { Router, type Request } from 'express';
import { handleWebhookPayload } from '../whatsappInbound';
import { markPost, markSignatureFailure, markWebhookVerified, verifyWhatsAppSignature } from '../whatsapp';

export const whatsappWebhookRouter = Router();

// Meta, webhook URL'sini kaydederken bu uç noktaya bir doğrulama isteği gönderir.
// https://developers.facebook.com/docs/graph-api/webhooks/getting-started
whatsappWebhookRouter.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && process.env.WHATSAPP_VERIFY_TOKEN && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    markWebhookVerified();
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Gelen WhatsApp mesajları / durum bildirimleri (Faz 1, Adım 7).
// 1) İmza: X-Hub-Signature-256, ham gövde üzerinden (index.ts saklar). Anahtar
//    tanımlıysa yanlış imza 403; tanımlı değilse yalnızca uyarı yazılır (yerel
//    geliştirme). Canlıda WHATSAPP_APP_SECRET zorunlu sayılır (health'te görünür).
// 2) 200 hemen döner; Meta 200 gelmezse yeniden gönderir. İşleme arka planda,
//    aynı messageId ikinci kez gelirse yok sayılır (whatsappInbound.ts).
whatsappWebhookRouter.post('/', (req: Request & { rawBody?: Buffer }, res) => {
  const verified = verifyWhatsAppSignature(req.rawBody, req.header('x-hub-signature-256'));
  if (verified === false) {
    markSignatureFailure();
    return res.sendStatus(403);
  }
  // Teşhis özeti: hangi alanlar geldi (mesaj içeriği yazılmaz).
  const changes = ((req.body as { entry?: { changes?: { field?: string; value?: Record<string, unknown> }[] }[] })?.entry ?? []).flatMap((e) => e.changes ?? []);
  markPost(changes.map((c) => `${c.field}:${Object.keys(c.value ?? {}).filter((k) => k === 'messages' || k === 'statuses').join('+') || '-'}`).join(',') || 'bos');
  if (verified === null) console.warn('[whatsapp webhook] WHATSAPP_APP_SECRET tanımlı değil; imza doğrulanmadı');

  res.sendStatus(200);
  void handleWebhookPayload(req.body).catch((err) => console.error('[whatsapp webhook] işleme hatası:', err));
});
