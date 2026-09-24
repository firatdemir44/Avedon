import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCanonicalPhone, maskPhone, normalizePhone, phoneCandidatesFromWhatsApp, toWhatsAppNumber } from './phone';

test('Türkiye numarasının tüm yazımları aynı kanonik biçime iner', () => {
  const want = '05389325527';
  for (const v of ['05389325527', '5389325527', '+905389325527', '905389325527', '00905389325527', '+90 538 932 55 27', '0 (538) 932-55-27', '0538.932.55.27', ' +90-538-932-5527 ']) {
    assert.equal(normalizePhone(v), want, v);
  }
  assert.equal(normalizePhone('2121234567'), '02121234567');
  assert.equal(normalizePhone('+90 212 123 45 67'), '02121234567');
});

test('yabancı numara "+" ve rakamlar olur; 00 öneki + sayılır', () => {
  assert.equal(normalizePhone('+49 170 1234567'), '+491701234567');
  assert.equal(normalizePhone('0049 170 1234567'), '+491701234567');
  assert.equal(normalizePhone('491701234567'), '+491701234567');
  assert.equal(normalizePhone('+1 (212) 555-0100'), '+12125550100');
  assert.equal(normalizePhone(''), '');
});

test('kanonik biçim sabit noktadır', () => {
  for (const v of ['05389325527', '+491701234567', '02121234567']) {
    assert.equal(normalizePhone(normalizePhone(v)), v);
    assert.ok(isCanonicalPhone(v));
  }
  assert.ok(!isCanonicalPhone('+905389325527'));
});

test('WhatsApp biçimi ve gelen numara adayları', () => {
  assert.equal(toWhatsAppNumber('05389325527'), '905389325527');
  assert.equal(toWhatsAppNumber('+491701234567'), '491701234567');
  assert.equal(phoneCandidatesFromWhatsApp('905389325527')[0], '05389325527');
  assert.equal(phoneCandidatesFromWhatsApp('491701234567')[0], '+491701234567');
});

test('maske yalnızca son 4 haneyi gösterir', () => {
  assert.equal(maskPhone('05389325527'), '•••••••5527');
});
