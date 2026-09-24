import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localizeLabels, normalizeLang, t, tx } from './index';
import { localizeNotification } from '../notifications';
import { greetingText } from '../assistant/persona';
import { digestText } from '../assistantReport';

test('t: Türkçe anahtar, İngilizce karşılık, yer tutucular', () => {
  assert.equal(t('en', 'Yeni bağlantı isteği'), 'New connection request');
  assert.equal(t('tr', 'Yeni bağlantı isteği'), 'Yeni bağlantı isteği');
  assert.equal(t(undefined, 'Yeni bağlantı isteği'), 'Yeni bağlantı isteği');
  assert.equal(t('en', 'Teklif geldi: {code}', { code: 'K-12' }), 'Quote received: K-12');
  assert.equal(t('tr', 'Teklif geldi: {code}', { code: 'K-12' }), 'Teklif geldi: K-12');
  // Sözlükte olmayan metin olduğu gibi döner.
  assert.equal(t('en', 'Sözlükte olmayan cümle'), 'Sözlükte olmayan cümle');
  assert.equal(normalizeLang('en-US'), 'en');
  assert.equal(normalizeLang('de'), 'tr');
});

test('tx: değeri gömülü Türkçe cümleyi kalıpla çevirir', () => {
  assert.equal(tx('en', 'Kumaş çeşidi tanınmadı: Kaşe'), 'Fabric type not recognized: Kaşe');
  assert.equal(tx('en', '3 ürün bulundu: A1, B2'), '3 products found: A1, B2');
  assert.equal(tx('tr', '3 ürün bulundu: A1, B2'), '3 ürün bulundu: A1, B2');
  assert.equal(tx('en', 'serbest kullanıcı yazısı'), 'serbest kullanıcı yazısı');
});

test('localizeLabels: yalnızca etiket alanları, yalnızca sözlükte olanlar', () => {
  const out = localizeLabels({ categories: [{ key: 'orme', label: 'Örme', name: 'Örme' }], statusLabel: 'Onaylandı', note: 'Onaylandı', at: new Date(0) }) as Record<string, unknown>;
  assert.deepEqual(out, { categories: [{ key: 'orme', label: 'Knitted', name: 'Örme' }], statusLabel: 'Approved', note: 'Onaylandı', at: new Date(0).toISOString() });
});

test('bildirim: alıcının diline göre, kullanıcı yazısı çevrilmez', () => {
  const input = { kind: 'quote_received' as const, title: 'Teklif geldi: {code}', vars: { code: 'K-1' }, body: 'Acme {x}', rawBody: true };
  assert.deepEqual(localizeNotification('en', input), { title: 'Quote received: K-1', body: 'Acme {x}' });
  assert.deepEqual(localizeNotification('tr', input), { title: 'Teklif geldi: K-1', body: 'Acme {x}' });
  const status = { kind: 'sample_request_status' as const, title: '{code}: {status}', vars: { code: 'K-1', status: 'Onaylandı' }, translateVars: ['status'] };
  assert.equal(localizeNotification('en', status).title, 'K-1: Approved');
  assert.equal(localizeNotification('tr', status).title, 'K-1: Onaylandı');
});

test('asistan karşılaması ve haftalık özet İngilizce', () => {
  const g = greetingText({ firstName: 'Anna', hour: 9, pendingIncoming: 2, unreadMessages: 0, memoryEmpty: false, lang: 'en' });
  assert.ok(g.startsWith("Good morning Anna, I'm the Takyon assistant."), g);
  assert.ok(g.includes('2 sample request(s) waiting for a reply'));
  const report = { questions: 5, askerCompanies: 2, answeredByAssistant: 3, forwardedOpen: 1 } as Parameters<typeof digestText>[0];
  assert.equal(digestText(report, 'en'), '5 questions came from 2 companies, your assistant answered 3 of them itself, questions waiting for your answer: 1.');
  assert.equal(digestText(report), '2 firmadan 5 soru geldi, 3 tanesini asistanınız kendisi cevapladı, 1 soru sizin cevabınızı bekliyor.');
});
