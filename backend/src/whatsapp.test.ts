import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phoneCandidatesFromWhatsApp, toWhatsAppNumber } from './phone';
import { signWhatsAppBody, verifyWhatsAppSignature } from './whatsapp';
import { composeWhatsAppReply, parseInboundMessages } from './whatsappInbound';

test('telefon: kayıt biçimi ↔ WhatsApp biçimi', () => {
  assert.equal(toWhatsAppNumber('0532 123 45 67'), '905321234567');
  assert.equal(toWhatsAppNumber('+90 532 123 45 67'), '905321234567');
  assert.equal(toWhatsAppNumber('905321234567'), '905321234567');
  assert.equal(toWhatsAppNumber('00491701234567'), '491701234567');
  assert.deepEqual(phoneCandidatesFromWhatsApp('905321234567'), ['05321234567', '905321234567', '+905321234567']);
  // Yabancı numara: Türkiye yazımı türetilmez
  assert.deepEqual(phoneCandidatesFromWhatsApp('491701234567'), ['+491701234567', '491701234567']);
});

test('imza: doğru imza geçer, yanlış imza ve eksik başlık geçmez, anahtar yoksa null', () => {
  const body = Buffer.from('{"a":1}');
  process.env.WHATSAPP_APP_SECRET = 'gizli';
  assert.equal(verifyWhatsAppSignature(body, signWhatsAppBody(body, 'gizli')), true);
  assert.equal(verifyWhatsAppSignature(body, signWhatsAppBody(body, 'baska')), false);
  assert.equal(verifyWhatsAppSignature(body, 'sha256=abc'), false);
  assert.equal(verifyWhatsAppSignature(body, undefined), false);
  assert.equal(verifyWhatsAppSignature(undefined, signWhatsAppBody(body, 'gizli')), false);
  delete process.env.WHATSAPP_APP_SECRET;
  assert.equal(verifyWhatsAppSignature(body, 'sha256=abc'), null);
});

test('yük ayrıştırma: metin mesajları alınır, durum bildirimleri ve bozuk yük atlanır', () => {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              messages: [
                { id: 'wamid.1', from: '905321234567', timestamp: '1758000000', type: 'text', text: { body: '  30/1 Ne kaç tex? ' } },
                { id: 'wamid.2', from: '905321234567', timestamp: '1758000001', type: 'image', image: { id: 'x' } },
                { from: 'eksik-id' },
              ],
            },
          },
          { field: 'messages', value: { statuses: [{ id: 'wamid.1', status: 'delivered' }] } },
        ],
      },
    ],
  };
  const msgs = parseInboundMessages(payload);
  assert.equal(msgs.length, 2);
  assert.deepEqual(msgs[0], { messageId: 'wamid.1', from: '905321234567', body: '30/1 Ne kaç tex?', type: 'text', timestamp: new Date(1758000000 * 1000) });
  assert.equal(msgs[1].type, 'image');
  assert.equal(msgs[1].body, '');
  assert.deepEqual(parseInboundMessages(null), []);
  assert.deepEqual(parseInboundMessages({ entry: 'x' }), []);
});

test('WhatsApp cevabı: metin + araç özetleri + hafıza notu, uzunluk sınırı', () => {
  const reply = composeWhatsAppReply({
    message: {
      text: 'Hesapladım.',
      toolCalls: [{ title: 'İplik numarası çevirisi', summary: '30 Ne ≈ 19,7 tex.' }],
      memorySuggestions: [{ label: 'Boya firesi', value: 6 }],
    },
  });
  assert.ok(reply.startsWith('Hesapladım.'));
  assert.ok(reply.includes('İplik numarası çevirisi: 30 Ne ≈ 19,7 tex.'));
  assert.ok(reply.includes('Boya firesi = 6'));
  const long = composeWhatsAppReply({ message: { text: 'a'.repeat(5000), toolCalls: [], memorySuggestions: [] } });
  assert.ok(long.length <= 3500);
});
