import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidTaxId, normalizeTaxId } from './taxId';

test('vergi numarası: VKN 10, TCKN 11 hane kabul edilir', () => {
  assert.equal(isValidTaxId('1234567890'), true);
  assert.equal(isValidTaxId('12345678901'), true);
});

test('vergi numarası: eksik/fazla hane, harf ve boş reddedilir', () => {
  for (const v of ['', '123', '123456789', '123456789012', '12345abcde']) assert.equal(isValidTaxId(v), false, v);
});

test('vergi numarası: boşluk, nokta ve tire ayıklanır', () => {
  assert.equal(normalizeTaxId(' 123 456-78.90 '), '1234567890');
  assert.equal(isValidTaxId(normalizeTaxId('123 456 7890')), true);
});
