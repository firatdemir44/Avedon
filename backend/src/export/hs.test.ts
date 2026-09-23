import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestHs } from './hs';
import { scoreMarket } from './trade';
import { TARGET_COUNTRIES } from './countries';

test('elastanlı örme (Melide tipi) → 6004.10', () => {
  const r = suggestHs({ type: 'orme', composition: [{ fiber: 'poliamid', percent: 82 }, { fiber: 'elastan', percent: 18 }] });
  assert.equal(r.hs6, '600410');
  assert.equal(r.confidence, 'yuksek');
});

test('elastan %4 ise 6004 değil; polyester atkılı örme boyalı → 6006.32', () => {
  const r = suggestHs({ type: 'orme', composition: [{ fiber: 'polyester', percent: 96 }, { fiber: 'elastan', percent: 4 }], finishTags: ['duz_boya'] });
  assert.equal(r.hs6, '600632');
});

test('pamuklu süprem baskılı → 6006.24', () => {
  assert.equal(suggestHs({ type: 'orme', composition: [{ fiber: 'pamuk', percent: 100 }], finishTags: ['baskili'] }).hs6, '600624');
});

test('raşel (çözgülü) sentetik boyalı → 6005.37; boya bilinmiyorsa baskılı alternatif', () => {
  const r = suggestHs({ type: 'raschel', composition: [{ fiber: 'polyester', percent: 100 }] });
  assert.equal(r.hs6, '600537');
  assert.equal(r.alternatives[0]?.hs6, '600539');
});

test('pamuklu dokuma gramaja göre 5208 / 5209, denim 5209.42', () => {
  assert.equal(suggestHs({ type: 'dokuma', subtype: 'poplin', weightGsm: 120, composition: [{ fiber: 'pamuk', percent: 100 }] }).hs6, '520832');
  assert.equal(suggestHs({ type: 'dokuma', subtype: 'gabardin', weightGsm: 260, composition: [{ fiber: 'pamuk', percent: 98 }, { fiber: 'elastan', percent: 2 }] }).hs6, '520932');
  assert.equal(suggestHs({ type: 'dokuma', subtype: 'denim', weightGsm: 340, composition: [{ fiber: 'pamuk', percent: 100 }] }).hs6, '520942');
});

test('karışımda baskın lif: %60 polyester %40 viskon dokuma → sentetik (5407)', () => {
  assert.equal(suggestHs({ type: 'dokuma', composition: [{ fiber: 'polyester', percent: 60 }, { fiber: 'viskon', percent: 40 }] }).hs4, '5407');
});

test('iplik: polyester DTY → 5402.33, penye pamuk → 5205.23', () => {
  assert.equal(suggestHs({ type: 'iplik', yarn: { family: 'polyester', filamentType: 'dty' } }).hs6, '540233');
  assert.equal(suggestHs({ type: 'iplik', yarn: { family: 'pamuk', combing: 'penye' } }).hs6, '520523');
});

test('pazar puanı: engelli ülke puanlanmaz; Türkiye payı ve birim fiyat hesaplanır', () => {
  const il = TARGET_COUNTRIES.find((c) => c.iso2 === 'IL')!;
  assert.equal(scoreMarket(il, null, null).blocked, true);
  const de = TARGET_COUNTRIES.find((c) => c.iso2 === 'DE')!;
  const cur = { year: 2024, total: 76_500_000, totalKg: 4_700_000, partners: [{ partner: 0, value: 76_500_000, kg: 4_700_000 }, { partner: 380, value: 27_400_000, kg: 880_000 }, { partner: 792, value: 12_500_000, kg: 1_120_000 }, { partner: 156, value: 7_300_000, kg: 925_000 }] };
  const prev = { ...cur, year: 2023, total: 89_300_000 };
  const row = scoreMarket(de, cur, prev);
  assert.equal(Math.round(row.turkeySharePct!), 16);
  assert.equal(row.turkeyRank, 2);
  assert.equal(Math.round(row.unitUsdKg.turkey! * 10) / 10, 11.2);
  assert.ok(row.growthPct! < 0);
  assert.ok(row.score! > 30 && row.score! < 100, String(row.score));
});
