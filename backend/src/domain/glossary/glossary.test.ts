import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCT_TYPES, SUBTYPES } from '../../catalog';
import {
  FIBERS,
  FIBER_INDEX,
  SUBTYPE_SYNONYMS,
  checkPassport,
  convertYarnCount,
  findCertificates,
  findTerms,
  fold,
  formatComposition,
  kgToMeters,
  knitSearchKeys,
  matchKnit,
  metersPerKg,
  metersToKg,
  parseComposition,
  parseMeasures,
  tokenize,
  validateCompositionItems,
} from './index';

// ---------------------------------------------------------------------------
// Normalizasyon
// ---------------------------------------------------------------------------

test('fold: Türkçe harfler ve büyük İ katlanır', () => {
  assert.equal(fold('SÜPREM'), 'suprem');
  assert.equal(fold('İnterlok'), 'interlok');
  assert.equal(fold('Şardonlu Üç İplik'), 'sardonlu uc iplik');
  assert.equal(fold('  Pamuk,  %95 '), 'pamuk, %95');
});

test('tokenize: yüzde ve bölü işaretleri', () => {
  assert.deepEqual(tokenize('%95 Pamuk %5 Elastan'), ['%95', 'pamuk', '%5', 'elastan']);
  assert.deepEqual(tokenize('95/5 CO/EA'), ['95', '/', '5', 'co', '/', 'ea']);
});

// ---------------------------------------------------------------------------
// Sözlük bütünlüğü
// ---------------------------------------------------------------------------

test('alt çeşit eşanlamlı anahtarları katalogla aynı', () => {
  const catalogKeys = new Set(PRODUCT_TYPES.flatMap((t) => SUBTYPES[t].map((s) => s.key)));
  for (const key of Object.keys(SUBTYPE_SYNONYMS)) {
    assert.ok(catalogKeys.has(key), `katalogda olmayan alt çeşit: ${key}`);
  }
  for (const key of catalogKeys) {
    assert.ok(key in SUBTYPE_SYNONYMS, `eşanlamlısı tanımlanmamış alt çeşit: ${key}`);
  }
});

test('lif eşanlamlıları kendi anahtarına gider', () => {
  const cases: [string, string][] = [
    ['cotton', 'pamuk'],
    ['CO', 'pamuk'],
    ['PES', 'polyester'],
    ['Spandex', 'elastan'],
    ['Likra', 'elastan'],
    ['Viscose', 'viskon'],
    ['Nylon', 'poliamid'],
    ['Yün', 'yun'],
    ['Tencel', 'lyocell'],
  ];
  for (const [text, key] of cases) {
    const m = findTerms(text, FIBER_INDEX, { allowAbbreviations: true })[0];
    assert.ok(m, `eşleşme yok: ${text}`);
    assert.equal(m.key, key, text);
  }
  assert.equal(FIBERS.length, new Set(FIBERS.map((f) => f.key)).size, 'lif anahtarları tekil');
});

test('kısaltmalar serbest aramada eşleşmez, kompozisyonda eşleşir', () => {
  assert.equal(findTerms('el işi kumaş', FIBER_INDEX).length, 0);
  assert.equal(findTerms('el işi kumaş', FIBER_INDEX, { allowAbbreviations: true })[0]?.key, 'elastan');
});

// ---------------------------------------------------------------------------
// Örgü / çeşit
// ---------------------------------------------------------------------------

test('matchKnit: eşanlamlıdan alt çeşit ve çeşit', () => {
  assert.deepEqual(pick(matchKnit('Single Jersey 30/1 penye')), { type: 'orme', subtype: 'suprem' });
  assert.deepEqual(pick(matchKnit('interlock kumaş')), { type: 'orme', subtype: 'interlok' });
  assert.deepEqual(pick(matchKnit('power net')), { type: 'raschel', subtype: 'elastanli_tul' });
  assert.deepEqual(pick(matchKnit('kot kumaş')), { type: 'dokuma', subtype: 'denim' });
  assert.deepEqual(pick(matchKnit('örme kumaş')), { type: 'orme', subtype: null });
  assert.deepEqual(pick(matchKnit('bir şey')), { type: null, subtype: null });
});

test('uzun eşanlamlı kısa olanı yener', () => {
  assert.equal(matchKnit('örme kadife').subtype, 'kadife_orme');
  assert.equal(matchKnit('kadife').subtype, 'kadife');
  assert.equal(matchKnit('elastanlı tül').subtype, 'elastanli_tul');
  assert.equal(matchKnit('tül').subtype, 'elastansiz_tul');
});

test('knitSearchKeys: arama eşanlamlıları', () => {
  assert.deepEqual(knitSearchKeys('single jersey'), { types: [], subtypes: ['suprem'] });
  assert.deepEqual(knitSearchKeys('woven'), { types: ['dokuma'], subtypes: [] });
  assert.deepEqual(knitSearchKeys('file'), { types: [], subtypes: ['file'] });
  assert.deepEqual(knitSearchKeys('profile'), { types: [], subtypes: [] }, 'kelime içi eşleşme yok');
});

// ---------------------------------------------------------------------------
// Sertifikalar
// ---------------------------------------------------------------------------

test('sertifika yazımları', () => {
  assert.equal(findCertificates('OEKO-TEX Standard 100 sertifikalı')[0]?.key, 'oeko_tex_100');
  assert.equal(findCertificates('Öko-Tex')[0]?.key, 'oeko_tex_100');
  assert.equal(findCertificates('GRS ve GOTS').map((m) => m.key).sort().join(','), 'gots,grs');
  assert.equal(findCertificates('ISO 9001:2015')[0]?.key, 'iso_9001');
});

// ---------------------------------------------------------------------------
// Birimler
// ---------------------------------------------------------------------------

test('iplik numarası: 75 tex ≈ 8 Ne / 13 Nm (mevcut referans)', () => {
  const r = convertYarnCount(75, 'tex');
  assert.equal(Math.round(r.ne), 8);
  assert.equal(Math.round(r.nm), 13);
  assert.equal(r.denye, 675);
});

test('iplik numarası gidiş-dönüş ve katlı iplik', () => {
  const r = convertYarnCount(30, 'ne');
  assert.ok(Math.abs(convertYarnCount(r.tex, 'tex').ne - 30) < 1e-9);
  assert.ok(Math.abs(convertYarnCount(60, 'ne', 2).tex - convertYarnCount(30, 'ne').tex) < 1e-9, '60/2 Ne = 30 Ne');
});

test('gramaj/en/metretül', () => {
  // 200 gr/m², 180 cm → 1 m = 360 g → 1 kg ≈ 2,78 m
  assert.ok(Math.abs(metersPerKg(200, 180) - 2.7778) < 0.001);
  assert.ok(Math.abs(metersToKg(1000, 200, 180) - 360) < 1e-9);
  assert.ok(Math.abs(kgToMeters(360, 200, 180) - 1000) < 1e-9);
  assert.equal(metersPerKg(0, 180), 0);
});

test('parseMeasures: gramaj, en, en tipi, iplik', () => {
  const a = parseMeasures('Süprem 30/1 penye, 180 gr/m², 180 cm tüp en');
  assert.equal(a.gsm, 180);
  assert.equal(a.widthCm, 180);
  assert.equal(a.widthType, 'tup');
  assert.equal(a.yarns.length, 1);
  assert.equal(a.yarns[0].count, 30);
  assert.equal(a.yarns[0].unit, 'ne');
  assert.equal(a.yarns[0].ply, 1);
  assert.equal(a.yarns[0].yarnType, 'penye');

  const b = parseMeasures('220 gsm, 150cm açık en, 150 denye DTY');
  assert.equal(b.gsm, 220);
  assert.equal(b.widthCm, 150);
  assert.equal(b.widthType, 'acik');
  assert.deepEqual(b.yarns.map((y) => [y.count, y.unit, y.yarnType]), [[150, 'denye', 'dty']]);

  const c = parseMeasures('%95 pamuk %5 elastan');
  assert.equal(c.gsm, null);
  assert.equal(c.yarns.length, 0, 'kompozisyon oranı iplik sanılmaz');

  const d = parseMeasures('Nm 50/2 yün');
  assert.deepEqual([d.yarns[0].count, d.yarns[0].unit, d.yarns[0].ply], [50, 'nm', 2]);
});

// ---------------------------------------------------------------------------
// Kompozisyon
// ---------------------------------------------------------------------------

const P = (fiber: string, percent: number) => ({ fiber, percent });

test('parseComposition: 30+ gerçek yazım', () => {
  const cases: [string, { fiber: string; percent: number }[], number][] = [
    ['%95 Pamuk %5 Elastan', [P('pamuk', 95), P('elastan', 5)], 1],
    ['95% Cotton 5% Elastane', [P('pamuk', 95), P('elastan', 5)], 1],
    ['95/5 CO/EA', [P('pamuk', 95), P('elastan', 5)], 0.9],
    ['92 pes 8 ea', [P('polyester', 92), P('elastan', 8)], 0.9],
    ['100% Cotton', [P('pamuk', 100)], 1],
    ['Pamuk %95, Elastan %5', [P('pamuk', 95), P('elastan', 5)], 1],
    ['%100 PES', [P('polyester', 100)], 0.9],
    ['50 pamuk 50 polyester', [P('pamuk', 50), P('polyester', 50)], 1],
    ['co 95 ea 5', [P('pamuk', 95), P('elastan', 5)], 0.9],
    ['%94 PES %6 EA', [P('polyester', 94), P('elastan', 6)], 0.9],
    ['% 100 Pamuk', [P('pamuk', 100)], 1],
    ['%80 Pamuk %20 Polyester', [P('pamuk', 80), P('polyester', 20)], 1],
    ['%85 Poliamid %15 Elastan', [P('poliamid', 85), P('elastan', 15)], 1],
    ['85% Nylon 15% Spandex', [P('poliamid', 85), P('elastan', 15)], 1],
    ['%60 Pamuk %40 Polyester', [P('pamuk', 60), P('polyester', 40)], 1],
    ['60/40 CO/PES', [P('pamuk', 60), P('polyester', 40)], 0.9],
    ['%70 Viskon %30 Polyester', [P('viskon', 70), P('polyester', 30)], 1],
    ['70% Viscose 30% Polyester', [P('viskon', 70), P('polyester', 30)], 1],
    ['%100 Polyester', [P('polyester', 100)], 1],
    ['polyester', [P('polyester', 100)], 0.5],
    ['%90 Pamuk %10 Elastan', [P('pamuk', 90), P('elastan', 10)], 1],
    ['%48 Pamuk %48 Polyester %4 Elastan', [P('pamuk', 48), P('polyester', 48), P('elastan', 4)], 1],
    ['48/48/4 CO/PES/EA', [P('pamuk', 48), P('polyester', 48), P('elastan', 4)], 0.9],
    ['%65 Polyester %35 Pamuk', [P('polyester', 65), P('pamuk', 35)], 1],
    ['%100 Merino Yün', [P('yun', 100)], 1],
    ['%50 Yün %50 Akrilik', [P('yun', 50), P('akrilik', 50)], 1],
    ['%100 Keten', [P('keten', 100)], 1],
    ['%55 Keten %45 Viskon', [P('keten', 55), P('viskon', 45)], 1],
    ['%95 Modal %5 Elastan', [P('modal', 95), P('elastan', 5)], 1],
    ['%100 Tencel', [P('lyocell', 100)], 1],
    ['%97 Pamuk %3 Likra', [P('pamuk', 97), P('elastan', 3)], 1],
    ['97% Baumwolle 3% Elasthan', [P('pamuk', 97), P('elastan', 3)], 1],
    ['%100 Organik Pamuk', [P('pamuk', 100)], 1],
    ['%92 Polyester %8 Elastan', [P('polyester', 92), P('elastan', 8)], 1],
    ['%95 Bambu %5 Elastan', [P('bambu', 95), P('elastan', 5)], 1],
  ];
  for (const [text, expected, minConfidence] of cases) {
    const r = parseComposition(text);
    assert.deepEqual(r.items, expected, text);
    assert.ok(r.confidence >= minConfidence, `${text}: güven ${r.confidence} < ${minConfidence}`);
  }
});

test('parseComposition: toplam 100 değilse güven düşer, kayıt yine mümkün', () => {
  const r = parseComposition('%95 Pamuk %3 Elastan');
  assert.equal(r.total, 98);
  assert.equal(r.confidence, 0.8);
  assert.deepEqual(validateCompositionItems(r.items), ['composition_total_98']);
});

test('parseComposition: tanınmayan lif "unknown" listesine düşer', () => {
  const r = parseComposition('%95 Pamuk %5 Zorlu');
  assert.deepEqual(r.items, [P('pamuk', 95)]);
  assert.ok(r.unknown.includes('zorlu'));
  assert.ok(r.confidence <= 0.5);
});

test('parseComposition: hiç lif yoksa boş', () => {
  const r = parseComposition('220 gr/m² 180 cm');
  assert.deepEqual(r.items, []);
  assert.equal(r.confidence, 0);
});

test('formatComposition: oran büyükten küçüğe, Türkçe etiket', () => {
  assert.equal(formatComposition([P('elastan', 5), P('pamuk', 95)]), '%95 Pamuk %5 Elastan');
  assert.equal(formatComposition([P('polyester', 92.5), P('elastan', 7.5)]), '%92,5 Polyester %7,5 Elastan');
  assert.equal(formatComposition([]), '');
});

test('validateCompositionItems: bilinmeyen lif ve oran', () => {
  assert.deepEqual(validateCompositionItems([P('uzaylif', 100)]), ['unknown_fiber:uzaylif']);
  assert.deepEqual(validateCompositionItems([P('pamuk', 0)]), ['invalid_percent:pamuk', 'composition_total_0']);
  assert.deepEqual(validateCompositionItems([P('pamuk', 100)]), []);
});

// ---------------------------------------------------------------------------
// Makullük
// ---------------------------------------------------------------------------

test('checkPassport: şüpheli değerler işaretlenir, engellenmez', () => {
  const ok = checkPassport({ type: 'orme', subtype: 'suprem', weightGsm: 160, widthCm: 180, composition: [P('pamuk', 95), P('elastan', 5)] });
  assert.equal(ok.ok, true);

  const bad = checkPassport({ type: 'orme', subtype: 'suprem', weightGsm: 900, widthCm: 20, composition: [P('pamuk', 50), P('elastan', 45)] });
  assert.deepEqual(bad.flags.sort(), ['composition_total_not_100', 'fiber_percent_high', 'gsm_high', 'width_low'].sort());
  assert.equal(bad.notes.length, 4);

  const wrongSub = checkPassport({ type: 'dokuma', subtype: 'suprem' });
  assert.deepEqual(wrongSub.flags, ['unknown_subtype']);
});

function pick(m: { type: string | null; subtype: string | null }) {
  return { type: m.type, subtype: m.subtype };
}
