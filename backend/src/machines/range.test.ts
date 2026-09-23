import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRange, rangeMatch } from './range';
import { buildMachineWhere, parseMachineQuery } from './query';

test('aralık: "28-22" → ilk sayı 28', () => {
  assert.deepEqual(parseRange('28-22'), { text: '28-22', values: [28, 22], first: 28 });
  assert.deepEqual(parseRange(' 28 / 26 '), { text: '28-26', values: [28, 26], first: 28 });
  assert.deepEqual(parseRange('2808-2210'), { text: '2808-2210', values: [2808, 2210], first: 2808 });
});

test('tek sayı ve boş', () => {
  assert.deepEqual(parseRange('2760'), { text: '2760', values: [2760], first: 2760 });
  assert.deepEqual(parseRange('7,5'), { text: '7.5', values: [7.5], first: 7.5 });
  assert.deepEqual(parseRange(''), { text: '', values: [], first: null });
  assert.deepEqual(parseRange(null), { text: '', values: [], first: null });
});

test('geçersiz aralık null döner', () => {
  assert.equal(parseRange('28-abc'), null);
  assert.equal(parseRange('0'), null);
});

test('arama "28 fine" aralıklı makineyi de tutar', () => {
  const q = parseMachineQuery('28 fine');
  assert.ok(q);
  assert.deepEqual(buildMachineWhere(q!).AND, [rangeMatch('gauge', 'gaugeText', 28)]);
  const or = (rangeMatch('gauge', 'gaugeText', 22).OR ?? []) as object[];
  assert.ok(or.some((c) => JSON.stringify(c) === JSON.stringify({ gaugeText: { endsWith: '-22' } })));
});

test('arama metninde aralık: "28-22 fine" → 28', () => {
  assert.equal(parseMachineQuery('yuvarlak 28-22 fine')?.gauge, 28);
});
