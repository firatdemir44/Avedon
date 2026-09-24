import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getActivePhoneNumber, getWhatsAppStatus, sendWhatsAppText, setPhoneNumberOverride } from './whatsapp';
import { filterForActiveNumber, parseInboundMessages } from './whatsappInbound';
import { redact } from './whatsappNumbers';

test('aktif numara: ayar varsa ortam değişkenini geçersiz kılar, yoksa ortam değişkeni', () => {
  const prev = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'env-id';
  setPhoneNumberOverride(null);
  assert.deepEqual(getActivePhoneNumber(), { id: 'env-id', source: 'env' });
  setPhoneNumberOverride('setting-id');
  assert.deepEqual(getActivePhoneNumber(), { id: 'setting-id', source: 'setting' });
  assert.equal(getWhatsAppStatus().activePhoneNumberSource, 'setting');
  assert.equal(getWhatsAppStatus().activePhoneNumberId, 'setting-id');
  setPhoneNumberOverride('  ');
  assert.equal(getActivePhoneNumber().source, 'env');
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  assert.deepEqual(getActivePhoneNumber(), { id: undefined, source: 'none' });
  if (prev !== undefined) process.env.WHATSAPP_PHONE_NUMBER_ID = prev;
});

test('gönderim ayardaki numaradan gider (fetch sahte)', async () => {
  const saved = { mock: process.env.WHATSAPP_MOCK, token: process.env.WHATSAPP_ACCESS_TOKEN, id: process.env.WHATSAPP_PHONE_NUMBER_ID };
  delete process.env.WHATSAPP_MOCK;
  process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'env-id';
  setPhoneNumberOverride('real-id');
  const origFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    urls.push(String(url));
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  try {
    await sendWhatsAppText('05321234567', 'merhaba');
    assert.equal(urls[0], 'https://graph.facebook.com/v21.0/real-id/messages');
  } finally {
    globalThis.fetch = origFetch;
    setPhoneNumberOverride(null);
    for (const [k, v] of [['WHATSAPP_MOCK', saved.mock], ['WHATSAPP_ACCESS_TOKEN', saved.token], ['WHATSAPP_PHONE_NUMBER_ID', saved.id]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('gelen mesaj: yalnız aktif numaraya gelenler işlenir, numara bilgisi yoksa kabul', () => {
  const payload = (pid?: string) => ({
    entry: [{ changes: [{ field: 'messages', value: { ...(pid ? { metadata: { phone_number_id: pid } } : {}), messages: [{ id: `m-${pid ?? 'x'}`, from: '905321234567', type: 'text', text: { body: 'a' } }] } }] }],
  });
  setPhoneNumberOverride('active');
  assert.equal(filterForActiveNumber(parseInboundMessages(payload('active'))).length, 1);
  assert.equal(filterForActiveNumber(parseInboundMessages(payload('old-test'))).length, 0);
  assert.equal(filterForActiveNumber(parseInboundMessages(payload())).length, 1);
  setPhoneNumberOverride(null);
});

test('redact: PIN ve anahtar Meta mesajında görünmez', () => {
  const out = redact('Invalid PIN 123456 token abc123secret ' + 'x'.repeat(50), ['123456', 'abc123secret']);
  assert.ok(!out.includes('123456'));
  assert.ok(!out.includes('abc123secret'));
  assert.ok(!out.includes('x'.repeat(50)));
});
