import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PERSONA, PERSONAS, greetingText, isPersonaKey, personaBlock, personaFor } from './persona';

test('kişilik: bilinen anahtar, bilinmeyen → varsayılan İpek', () => {
  assert.equal(personaFor('mert').name, 'Mert');
  assert.equal(personaFor('').key, DEFAULT_PERSONA);
  assert.equal(personaFor(null).key, 'ipek');
  assert.equal(isPersonaKey('ayse'), false);
});

test('karşılama: saat, ad, bekleyen işler, boş hafıza', () => {
  const ipek = PERSONAS.ipek;
  const morning = greetingText(ipek, { firstName: 'Fırat', hour: 9, pendingIncoming: 2, unreadMessages: 1, memoryEmpty: true });
  assert.ok(morning.startsWith('Günaydın Fırat, ben İpek.'));
  assert.ok(morning.includes('2 numune talebi cevap bekliyor') && morning.includes('1 okunmamış mesajın var'));
  assert.ok(morning.includes('bir daha sormam'));
  assert.ok(morning.endsWith('Ne hesaplayalım?'));
  const evening = greetingText(PERSONAS.mert, { firstName: null, hour: 21, pendingIncoming: 0, unreadMessages: 0, memoryEmpty: false });
  assert.equal(evening, 'İyi akşamlar, ben Mert. Ne hesaplayalım?');
});

test('kişilik bloğu: karakter sesi, ad tekrarı yasağı, sen hitabı', () => {
  const block = personaBlock(PERSONAS.mert, 'Fırat');
  assert.ok(block.includes('Adın Mert'));
  assert.ok(block.includes('her mesajda adını tekrarlamazsın'));
  assert.ok(block.includes('Fırat') && block.includes('"sen"'));
});
