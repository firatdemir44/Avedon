import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSISTANT_NAME, GREETING_CLOSE, greetingText, identityBlock } from './persona';

test('karşılama: saat, ad, bekleyen işler, boş hafıza', () => {
  const morning = greetingText({ firstName: 'Fırat', hour: 9, pendingIncoming: 2, unreadMessages: 1, memoryEmpty: true });
  assert.ok(morning.startsWith('Günaydın Fırat, ben Takyon asistanı.'));
  assert.ok(morning.includes('2 numune talebi cevap bekliyor') && morning.includes('1 okunmamış mesajın var'));
  assert.ok(morning.includes('bir daha sormam'));
  assert.ok(morning.endsWith(GREETING_CLOSE));
  const evening = greetingText({ firstName: null, hour: 21, pendingIncoming: 0, unreadMessages: 0, memoryEmpty: false });
  assert.equal(evening, `İyi akşamlar, ben Takyon asistanı. ${GREETING_CLOSE}`);
});

test('kimlik bloğu: tek ad, İpek/Mert yok, ad tekrarı yasağı, sen hitabı', () => {
  const block = identityBlock('Fırat');
  assert.equal(ASSISTANT_NAME, 'Takyon asistanı');
  assert.ok(block.includes('Senin adın Takyon asistanı'));
  assert.ok(!block.includes('İpek') && !block.includes('Mert'));
  assert.ok(block.includes('her mesajda adını tekrarlamazsın'));
  assert.ok(block.includes('Fırat') && block.includes('"sen"'));
});
