import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockSuggest, validateItems, parseItems, systemPrompt, type CatalogRow } from './sampleSets';
import { buildPublicView } from '../routes/sampleSets';

const row = (id: string, extra: Partial<CatalogRow> = {}): CatalogRow => ({
  id,
  code: `K-${id}`,
  type: 'orme',
  subtype: 'suprem',
  weightGsm: 160,
  widthCm: 180,
  stock: 500,
  stockUnit: 'm',
  usages: '["tisortluk"]',
  finishTags: '["sardonlu"]',
  content: 'iç not: maliyet 3 USD',
  compositions: [{ fiber: 'pamuk', percent: 95 }, { fiber: 'elastan', percent: 5 }],
  yarnSpec: null,
  _count: { images: 1 },
  ...extra,
});

test('validateItems: firmaya ait olmayan ve tekrar eden kimlikler atılır, puan 0-100', () => {
  const allowed = new Set(['a', 'b', 'c']);
  const out = validateItems(
    [
      { productId: 'a', score: 150, reason: ' iyi ' },
      { productId: 'x', score: 90, reason: 'uydurma' },
      { productId: 'a', score: 10, reason: 'tekrar' },
      { productId: 'b', score: -5, reason: 'düşük' },
      { productId: 'c', score: 70.4, reason: 'orta' },
    ],
    allowed
  );
  assert.deepEqual(out.map((i) => i.productId), ['a', 'c', 'b']);
  assert.deepEqual(out.map((i) => i.score), [100, 70, 0]);
  assert.equal(out[0].reason, 'iyi');
  assert.ok(out.every((i) => i.selected));
});

test('validateItems: en çok 10 ürün', () => {
  const ids = Array.from({ length: 15 }, (_, i) => `p${i}`);
  const out = validateItems(ids.map((productId, i) => ({ productId, score: i, reason: '' })), new Set(ids));
  assert.equal(out.length, 10);
  assert.equal(out[0].productId, 'p14');
});

test('mock öneri: ilk 5 ürün, deterministik ve geçerli', () => {
  const catalog = Array.from({ length: 8 }, (_, i) => row(`id${i}`));
  const a = mockSuggest(catalog, 'tr');
  assert.deepEqual(a, mockSuggest(catalog, 'tr'));
  assert.deepEqual(a.items.map((i) => i.productId), ['id0', 'id1', 'id2', 'id3', 'id4']);
  assert.equal(validateItems(a.items, new Set(catalog.map((p) => p.id))).length, 5);
  assert.match(mockSuggest(catalog, 'en').summary, /Test mode/);
});

test('parseItems: bozuk JSON boş dizi; selected varsayılan true', () => {
  assert.deepEqual(parseItems('bozuk'), []);
  assert.equal(parseItems('[{"productId":"a","score":5,"reason":"r"}]')[0].selected, true);
});

test('sistem istemi: yalnız verilen kimlikler ve "tahmin" kuralı', () => {
  const s = systemPrompt('en');
  assert.match(s, /YALNIZCA katalogda verilen productId/);
  assert.match(s, /tahmin/);
  assert.match(s, /English/);
});

test('herkese açık görünüm: yalnız seçilenler; fiyat, stok, puan, gerekçe, iç not yok', () => {
  const set = {
    title: 'Burberry için kartela',
    itemsJson: JSON.stringify([
      { productId: 'a', score: 90, reason: 'gizli gerekçe', selected: true },
      { productId: 'b', score: 80, reason: 'x', selected: false },
      { productId: 'silinmis', score: 70, reason: 'x', selected: true },
    ]),
    lang: 'tr',
    updatedAt: new Date('2026-10-04'),
  };
  const view = buildPublicView(set, 'Örnek Tekstil', 'Burberry', [row('a'), row('b')], 'en');
  assert.equal(view.title, 'Swatch set for Burberry');
  assert.equal(view.items.length, 1);
  const item = view.items[0];
  assert.equal(item.code, 'K-a');
  assert.equal(item.composition, '95% Cotton, 5% Elastane');
  assert.equal(item.type, 'Knitted');
  assert.deepEqual(item.finishes, ['Brushed']);
  assert.match(item.passportUrl, /pasaport\.html\?id=a$/);
  const json = JSON.stringify(view);
  for (const banned of ['price', 'stock', 'score', 'reason', 'moq', 'leadTime', 'maliyet', 'gizli', 'summary']) {
    assert.ok(!json.toLowerCase().includes(banned.toLowerCase()), `herkese açık yanıtta "${banned}" olmamalı`);
  }
});
