import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compositionOverlap, normalizeFiberKey, rankWithLabel, shortComposition, type LabelCandidate } from './labelMatch';

const c = (...pairs: [string, number][]) => pairs.map(([fiber, percent]) => ({ fiber, percent }));
const LABEL = c(['polyester', 92], ['elastan', 8]);

test('lif anahtarı sözlükle normalleşir', () => {
  assert.equal(normalizeFiberKey('elastan'), 'elastan');
  assert.equal(normalizeFiberKey('Elastane'), 'elastan');
  assert.equal(normalizeFiberKey('PES'), 'polyester');
});

test('kompozisyon uyumu: Σ min', () => {
  assert.equal(compositionOverlap(LABEL, LABEL), 100);
  assert.equal(compositionOverlap(LABEL, c(['polyester', 95], ['elastan', 5])), 97);
  assert.equal(compositionOverlap(LABEL, c(['pamuk', 100])), 0);
  assert.equal(compositionOverlap(LABEL, c(['Polyester', 50], ['pamuk', 50])), 50);
  assert.equal(compositionOverlap(LABEL, []), 0);
  assert.equal(compositionOverlap(c(['polyester', 60], ['polyester', 40]), c(['polyester', 100])), 100);
});

test('kısa yazım', () => {
  assert.equal(shortComposition(LABEL), '%92 PES %8 EA');
});

const cand = (id: string, comp: [string, number][], extra: Partial<LabelCandidate> = {}): LabelCandidate => ({
  id,
  composition: c(...comp),
  stock: 0,
  createdAt: new Date('2026-01-01'),
  reasons: [],
  ...extra,
});

test('yalnız etiket: uyum → stok → yeni; 50 altı atılır', () => {
  const { ranked, warnings } = rankWithLabel(
    [
      cand('pamuk', [['pamuk', 100]]),
      cand('eski', [['polyester', 92], ['elastan', 8]]),
      cand('stokta', [['polyester', 92], ['elastan', 8]], { stock: 10 }),
      cand('yeni', [['polyester', 92], ['elastan', 8]], { createdAt: new Date('2026-06-01') }),
      cand('yakin', [['polyester', 95], ['elastan', 5]]),
    ],
    LABEL
  );
  assert.deepEqual(ranked.map((r) => r.item.id), ['stokta', 'yeni', 'eski', 'yakin']);
  assert.deepEqual(warnings, []);
  assert.ok(ranked[0].reasons[0].startsWith('İçerik %100 uyumlu (etiket: %92 PES %8 EA)'));
});

test('hepsi zayıfsa tutulur ve uyarı döner', () => {
  const { ranked, warnings } = rankWithLabel([cand('a', [['pamuk', 100]]), cand('b', [['polyester', 30], ['pamuk', 70]])], LABEL);
  assert.deepEqual(ranked.map((r) => r.item.id), ['b', 'a']);
  assert.equal(warnings.length, 1);
});

test('fotoğraf + etiket: görünüm + içerik bonusu − elastan cezası', () => {
  const { ranked } = rankWithLabel(
    [
      cand('gorunumu-iyi-elastansiz', [['polyester', 100]], { lookScore: 90 }),
      cand('tam-uyum', [['polyester', 92], ['elastan', 8]], { lookScore: 75 }),
      cand('uyumsuz', [['pamuk', 100]], { lookScore: 99 }),
    ],
    LABEL
  );
  // 90 + 27.6 − 10 = 107.6 ; 75 + 30 = 105 ; uyumsuz (0) atılır
  assert.deepEqual(ranked.map((r) => r.item.id), ['gorunumu-iyi-elastansiz', 'tam-uyum']);
  assert.equal(Math.round(ranked[0].total * 10) / 10, 107.6);
  assert.equal(ranked[1].total, 105);
  assert.ok(ranked[0].reasons.some((r) => r.includes('elastan')));
});
