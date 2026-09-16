import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CORROBORATED_CONFIDENCE, MIN_CONFIDENCE, finalizeExtraction, rawExtractionSchema, type RawExtraction, type RawField } from './index';
import { mockRawExtraction } from './mock';

const f = (value: string | null, confidence: number, evidence: string | null = value): RawField => ({ value, confidence, evidence });

// Gerçek bir etiketin model tarafından okunmuş hali; testler bunun üzerinde oynar.
function sampleRaw(overrides: Partial<RawExtraction> = {}): RawExtraction {
  return {
    type: f('orme', 0.9, 'Single Jersey'),
    subtype: f('Single Jersey', 0.9),
    code: f('SJ-180', 0.95, 'Art. SJ-180'),
    composition: f('95% CO 5% EA', 0.9),
    weightGsm: f('180', 0.8, '180 gr/m²'),
    widthCm: f('185', 0.8, 'En: 185 cm'),
    widthType: f('tup', 0.8, 'tüp'),
    yarns: f('Ne 30/1 penye', 0.9),
    certificates: f('OEKO-TEX Standard 100 | 12.HTR.34567 | 2027-03-01', 0.9, 'OEKO-TEX Standard 100'),
    finishTags: f('silikon yumuşatma, Anti-pilling', 0.7),
    usages: f('T-shirt, spor giyim', 0.6, 'T-shirt'),
    notes: 'Lacivert, düz.',
    ...overrides,
  };
}

test('ham şema örnek çıktıyı kabul eder; eksik alanı reddeder', () => {
  assert.equal(rawExtractionSchema.safeParse(sampleRaw()).success, true);
  const { notes: _notes, ...missing } = sampleRaw();
  assert.equal(rawExtractionSchema.safeParse(missing).success, false);
});

test('kısaltmalı kompozisyon metni ayrıştırılır ve kanıtla doğrulanır', () => {
  const { extraction, rejected } = finalizeExtraction(sampleRaw());
  assert.deepEqual(extraction.composition.value, [
    { fiber: 'pamuk', percent: 95 },
    { fiber: 'elastan', percent: 5 },
  ]);
  assert.equal(extraction.composition.confidence, CORROBORATED_CONFIDENCE);
  assert.equal(rejected.filter((r) => r.field === 'composition').length, 0);
});

test('çeşit anahtarı, İngilizce ad ya da alt çeşitten türer', () => {
  assert.equal(finalizeExtraction(sampleRaw({ type: f('Knit', 0.9) })).extraction.type.value, 'orme');
  assert.equal(finalizeExtraction(sampleRaw({ type: f('woven', 0.9), subtype: f(null, 0, null) })).extraction.type.value, 'dokuma');
  // Model "dokuma" dedi ama süprem örmedir: alt çeşit kazanır.
  const r = finalizeExtraction(sampleRaw({ type: f('dokuma', 0.5) }));
  assert.equal(r.extraction.subtype.value, 'suprem');
  assert.equal(r.extraction.type.value, 'orme');
  // Anlamsız çeşit metni aktarılmaz
  const bad = finalizeExtraction(sampleRaw({ type: f('halı', 0.9), subtype: f(null, 0, null) }));
  assert.equal(bad.extraction.type.value, null);
  assert.ok(bad.rejected.some((x) => x.field === 'type' && x.reason === 'invalid_value'));
});

test('bilinmeyen alt çeşit aktarılmaz, rejected listesine düşer', () => {
  const { extraction, rejected } = finalizeExtraction(sampleRaw({ subtype: f('Uzay dokusu', 0.9) }));
  assert.equal(extraction.subtype.value, null);
  assert.ok(rejected.some((r) => r.field === 'subtype' && r.reason === 'unknown_subtype'));
  assert.equal(extraction.type.value, 'orme');
});

test('formda seçili çeşide ait olmayan alt çeşit aktarılmaz', () => {
  const { extraction, rejected } = finalizeExtraction(sampleRaw(), { hints: { type: 'raschel' } });
  assert.equal(extraction.subtype.value, null);
  assert.ok(rejected.some((r) => r.reason === 'subtype_not_in_type'));
});

test('kod başındaki "Art. No:" gibi ön ekler atılır', () => {
  assert.equal(finalizeExtraction(sampleRaw({ code: f('Art. No: MLD-R0034', 0.9) })).extraction.code.value, 'MLD-R0034');
  assert.equal(finalizeExtraction(sampleRaw({ code: f('Kod: P-12', 0.9) })).extraction.code.value, 'P-12');
});

test('gramaj metinden sayıya çevrilir, kanıtla doğrulanır; kanıt farklıysa güven düşer', () => {
  const ok = finalizeExtraction(sampleRaw()).extraction.weightGsm;
  assert.equal(ok.value, 180);
  assert.equal(ok.confidence, CORROBORATED_CONFIDENCE);

  const withUnit = finalizeExtraction(sampleRaw({ weightGsm: f('180 gr/m2', 0.8, null) })).extraction.weightGsm;
  assert.equal(withUnit.value, 180);
  assert.equal(withUnit.confidence, 0.8);

  const bad = finalizeExtraction(sampleRaw({ weightGsm: f('108', 0.8, '180 gr/m²') })).extraction.weightGsm;
  assert.equal(bad.value, 108);
  assert.ok(bad.confidence < 0.5);

  const junk = finalizeExtraction(sampleRaw({ weightGsm: f('ağır', 0.8, null) }));
  assert.equal(junk.extraction.weightGsm.value, null);
  assert.ok(junk.rejected.some((r) => r.field === 'weightGsm' && r.reason === 'invalid_value'));
});

test('makul olmayan gramaj güveni düşürür ve uyarı döner', () => {
  const { extraction, warnings } = finalizeExtraction(sampleRaw({ weightGsm: f('900', 0.9, null) }));
  assert.ok(warnings.codes.includes('gsm_high'));
  assert.ok(extraction.weightGsm.confidence <= 0.9 * 0.6 + 1e-9);
  assert.equal(extraction.weightGsm.value, 900); // 0,54 ≥ eşik; kullanıcı görür ve karar verir
});

test('eşiğin altındaki alan boş kalır (low_confidence)', () => {
  const { extraction, rejected } = finalizeExtraction(sampleRaw({ code: f('XX-1', 0.2, null) }));
  assert.equal(extraction.code.value, null);
  assert.ok(rejected.some((r) => r.field === 'code' && r.reason === 'low_confidence' && r.raw === 'XX-1'));
  assert.ok(MIN_CONFIDENCE > 0.2);
});

test('bilinmeyen lif düşer, kalanlar toplam uyarısı alır', () => {
  const { extraction, rejected, warnings } = finalizeExtraction(sampleRaw({ composition: f('%60 Pamuk %40 Zümrüt lifi', 0.9) }));
  assert.deepEqual(extraction.composition.value, [{ fiber: 'pamuk', percent: 60 }]);
  assert.ok(rejected.some((r) => r.reason === 'unknown_fiber'));
  assert.ok(warnings.codes.includes('composition_total_not_100'));
});

test('"yok"/"belirtilmemiş" gibi metinler boş sayılır', () => {
  const { extraction, rejected } = finalizeExtraction(sampleRaw({ widthType: f('belirtilmemiş', 0.3), certificates: f('yok', 0.5) }));
  assert.equal(extraction.widthType.value, null);
  assert.equal(extraction.certificates.value, null);
  assert.equal(rejected.filter((r) => r.field === 'widthType' || r.field === 'certificates').length, 0);
});

test('en tipi serbest yazımdan çözülür', () => {
  assert.equal(finalizeExtraction(sampleRaw({ widthType: f('tubular', 0.8) })).extraction.widthType.value, 'tup');
  assert.equal(finalizeExtraction(sampleRaw({ widthType: f('açık en', 0.8) })).extraction.widthType.value, 'acik');
});

test('iplik satırları ayrıştırılır; birim ve tip katalog anahtarına çevrilir', () => {
  const { extraction, rejected } = finalizeExtraction(sampleRaw({ yarns: f('150 D DTY; Nm 50/2 compact; 20 fersah', 0.9) }));
  assert.deepEqual(extraction.yarns.value, [
    { role: '', count: 150, unit: 'denye', ply: 1, yarnType: 'dty' },
    { role: '', count: 50, unit: 'nm', ply: 2, yarnType: 'kompakt' },
  ]);
  assert.ok(rejected.some((r) => r.field === 'yarns' && r.reason === 'unknown_yarn_unit'));
  assert.deepEqual(finalizeExtraction(sampleRaw()).extraction.yarns.value, [{ role: '', count: 30, unit: 'ne', ply: 1, yarnType: 'penye' }]);
});

test('sertifikalar "ad | no | tarih" ve serbest yazımdan çözülür; bilinmeyen düşer', () => {
  const { extraction, rejected } = finalizeExtraction(
    sampleRaw({
      certificates: f('OEKO-TEX Standard 100 | 12.HTR.34567 | 2027-03-01; Global Recycled Standard | | 03/2027; GOTS No: 8876 (01.06.2027); Komşu Onayı | |', 0.9),
    })
  );
  assert.deepEqual(extraction.certificates.value, [
    { name: 'oeko_tex_100', number: '12.HTR.34567', validUntil: '2027-03-01' },
    { name: 'grs', number: '', validUntil: null },
    { name: 'gots', number: '8876', validUntil: '2027-06-01' },
  ]);
  assert.ok(rejected.some((r) => r.reason === 'unknown_certificate'));
});

test('apre ve kullanım ifadeleri katalog anahtarına çevrilir', () => {
  const { extraction, rejected } = finalizeExtraction(sampleRaw());
  assert.deepEqual(extraction.finishTags.value, ['silikonlu', 'antipilling']);
  assert.deepEqual(extraction.usages.value, ['tisortluk', 'spor_giyim']);
  assert.equal(rejected.filter((r) => r.field === 'finishTags' || r.field === 'usages').length, 0);

  const odd = finalizeExtraction(sampleRaw({ finishTags: f('parıltılı', 0.7) }));
  assert.equal(odd.extraction.finishTags.value, null);
  assert.ok(odd.rejected.some((r) => r.field === 'finishTags' && r.reason === 'invalid_value'));

  const mixed = finalizeExtraction(sampleRaw({ finishTags: f('Yumusak tuse, UV korumali', 0.7) }));
  assert.deepEqual(mixed.extraction.finishTags.value, ['uv_koruma']);
});

test('alışılmış en bandının dışı güveni hafif düşürür ama uyarı vermez', () => {
  const inBand = finalizeExtraction(sampleRaw({ widthCm: f('160', 0.8, null) }));
  const outBand = finalizeExtraction(sampleRaw({ widthCm: f('185', 0.8, null) }));
  assert.equal(inBand.extraction.widthCm.confidence, 0.8);
  assert.equal(outBand.extraction.widthCm.confidence, 0.72);
  assert.equal(outBand.warnings.codes.length, 0);
});

test('fiyat, stok, MOQ ve termin şemada yer almaz', () => {
  const keys = Object.keys(rawExtractionSchema.shape);
  for (const forbidden of ['price', 'priceValue', 'stock', 'moq', 'leadTimeDays']) {
    assert.ok(!keys.includes(forbidden), forbidden);
  }
});

test('sahte çıkarım (ANTHROPIC_MOCK) metinden deterministik üretir ve şemaya uyar', () => {
  const raw = mockRawExtraction({
    images: [],
    document: null,
    text: 'Kod: MLD-Y0023 Elastanlı tül %82 poliamid %18 elastan 120 gr/m2 en 150 cm OEKO-TEX',
    hints: {},
  });
  assert.equal(rawExtractionSchema.safeParse(raw).success, true);
  const { extraction } = finalizeExtraction(raw);
  assert.equal(extraction.type.value, 'raschel');
  assert.equal(extraction.subtype.value, 'elastanli_tul');
  assert.equal(extraction.code.value, 'MLD-Y0023');
  assert.deepEqual(extraction.composition.value, [
    { fiber: 'poliamid', percent: 82 },
    { fiber: 'elastan', percent: 18 },
  ]);
  assert.equal(extraction.weightGsm.value, 120);
  assert.equal(extraction.widthCm.value, 150);
  assert.deepEqual(extraction.certificates.value?.map((c) => c.name), ['oeko_tex_100']);

  // Yalnızca fotoğraf: sabit örnek etiket, o da şemaya uyar.
  const photoOnly = mockRawExtraction({ images: [{ data: 'x', mediaType: 'image/jpeg' }], document: null, text: null, hints: {} });
  assert.equal(rawExtractionSchema.safeParse(photoOnly).success, true);
  const fin = finalizeExtraction(photoOnly).extraction;
  assert.equal(fin.composition.value?.length, 2);
  assert.equal(fin.certificates.value?.[0]?.number, '12.HTR.34567');
});
