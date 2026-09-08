// WhatsApp Business Platform (Meta Cloud API) entegrasyonu.
// Kurulum: Meta for Developers > WhatsApp > API Setup üzerinden alınan
// Phone Number ID ve Access Token'ı backend/.env dosyasına ekleyin:
//   WHATSAPP_PHONE_NUMBER_ID=...
//   WHATSAPP_ACCESS_TOKEN=...
//   WHATSAPP_VERIFY_TOKEN=... (webhook doğrulaması için, kendiniz belirlersiniz)
//
// Önemli kısıtlama: WhatsApp Business API, kullanıcı sizinle daha önce
// bir konuşma başlatmadıysa (24 saatlik pencere dışında) serbest metin
// mesajı göndermenize izin vermez — Meta'da onaylanmış bir "mesaj şablonu"
// (message template) kullanmanız gerekir. Bu yüzden ilk bildirimler için
// WHATSAPP_TEMPLATE_NAME ortam değişkeniyle onaylı bir şablon adı verin
// (yeni hesaplarda test için Meta'nın hazır "hello_world" şablonu kullanılabilir).

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_NAME;

export const isWhatsAppConfigured = !!PHONE_NUMBER_ID && !!ACCESS_TOKEN;

function toE164(phone: string): string {
  // Basit normalizasyon: Türkiye numaraları için başındaki 0'ı ülke koduyla değiştirir.
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) return `90${digits.slice(1)}`;
  if (digits.startsWith('90')) return digits;
  return digits;
}

/**
 * Serbest metin mesajı gönderir. Sadece alıcı son 24 saat içinde işletmeyle
 * bir konuşma başlattıysa çalışır; aksi halde Meta hata döner.
 */
export async function sendWhatsAppText(toPhone: string, message: string): Promise<void> {
  if (!isWhatsAppConfigured) {
    console.log(`[whatsapp] yapılandırılmamış, mesaj gönderilmedi -> ${toPhone}: ${message}`);
    return;
  }
  await callGraphApi({
    to: toE164(toPhone),
    type: 'text',
    text: { body: message },
  });
}

/**
 * Onaylı bir şablon üzerinden mesaj gönderir — 24 saatlik pencere dışında
 * (örn. ilk bildirim) bu yöntem kullanılmalıdır.
 */
export async function sendWhatsAppTemplate(toPhone: string, params: string[] = []): Promise<void> {
  if (!isWhatsAppConfigured || !TEMPLATE_NAME) {
    console.log(`[whatsapp] şablon yapılandırılmamış, mesaj gönderilmedi -> ${toPhone}`);
    return;
  }
  await callGraphApi({
    to: toE164(toPhone),
    type: 'template',
    template: {
      name: TEMPLATE_NAME,
      language: { code: 'tr' },
      ...(params.length > 0
        ? { components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] }
        : {}),
    },
  });
}

async function callGraphApi(payload: Record<string, unknown>): Promise<void> {
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[whatsapp] gönderim başarısız:', res.status, body);
    }
  } catch (err) {
    console.error('[whatsapp] istek hatası:', err);
  }
}
