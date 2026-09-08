import { Router } from 'express';

export const whatsappWebhookRouter = Router();

// Meta, webhook URL'sini kaydederken bu uç noktaya bir doğrulama isteği gönderir.
// https://developers.facebook.com/docs/graph-api/webhooks/getting-started
whatsappWebhookRouter.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Gelen WhatsApp mesajları / durum bildirimleri buraya düşer.
// Şimdilik sadece loglanıyor; ileride platform içi mesajlaşmaya bağlanabilir.
whatsappWebhookRouter.post('/', (req, res) => {
  console.log('[whatsapp webhook]', JSON.stringify(req.body));
  res.sendStatus(200);
});
