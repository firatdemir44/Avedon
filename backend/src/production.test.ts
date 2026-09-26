import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_PRODUCTION,
  MAX_PRODUCTION_REFERENCES,
  checkReference,
  nextFreePosition,
  productionSchema,
  toProductionData,
  toProductionView,
} from './production';

const valid = {
  ...EMPTY_PRODUCTION,
  productGroups: ['sutyen', 'ic_camasiri', 'mayo', 'tayt'],
  mainGroups: ['sutyen', 'ic_camasiri'],
  workMode: 'fason',
  monthlyCapacity: 50000,
  capacityByGroup: { sutyen: 30000 },
  moqPerModel: 500,
  sampleLeadDays: 7,
  productionLeadDays: 30,
  services: ['kesim', 'dikim'],
  certificates: [{ key: 'oeko_tex_100', docPosition: 0 }, { key: 'bsci' }],
  exportCountries: ['DE', 'NL'],
  employeeRange: '51-200',
};

test('üretim: geçerli giriş kabul edilir', () => {
  assert.equal(productionSchema.safeParse(valid).success, true);
  assert.equal(productionSchema.safeParse(EMPTY_PRODUCTION).success, true);
});

test('üretim: bilinmeyen anahtarlar reddedilir', () => {
  assert.equal(productionSchema.safeParse({ ...valid, productGroups: ['uzay_giysisi'] }).success, false);
  assert.equal(productionSchema.safeParse({ ...valid, services: ['kaynak'] }).success, false);
  assert.equal(productionSchema.safeParse({ ...valid, certificates: [{ key: 'xyz' }] }).success, false);
  assert.equal(productionSchema.safeParse({ ...valid, exportCountries: ['ZZ'] }).success, false);
  assert.equal(productionSchema.safeParse({ ...valid, workMode: 'hepsi' }).success, false);
  assert.equal(productionSchema.safeParse({ ...valid, fazlaAlan: 1 }).success, false);
});

test('üretim: sayılar negatif veya kesirli olamaz', () => {
  assert.equal(productionSchema.safeParse({ ...valid, monthlyCapacity: -1 }).success, false);
  assert.equal(productionSchema.safeParse({ ...valid, moqPerModel: 1.5 }).success, false);
  assert.equal(productionSchema.safeParse({ ...valid, productionLeadDays: 5000 }).success, false);
});

test('üretim: ana uzmanlık seçili gruplardan olmalı ve en çok 3', () => {
  assert.equal(productionSchema.safeParse({ ...valid, mainGroups: ['gomlek'] }).success, false);
  assert.equal(productionSchema.safeParse({ ...valid, mainGroups: ['sutyen', 'ic_camasiri', 'mayo', 'tayt'] }).success, false);
  assert.equal(productionSchema.safeParse({ ...valid, mainGroups: ['sutyen', 'ic_camasiri', 'mayo'] }).success, true);
  assert.equal(productionSchema.safeParse({ ...valid, mainGroups: ['sutyen', 'sutyen'] }).success, false);
});

test('üretim: grup bazında kapasite yalnız seçili gruplar için', () => {
  assert.equal(productionSchema.safeParse({ ...valid, capacityByGroup: { gomlek: 100 } }).success, false);
});

test('üretim: sertifika belge fotoğrafı varsa BELGELİ', () => {
  const data = toProductionData(productionSchema.parse(valid));
  const view = toProductionView({ ...data, monthlyCapacity: 50000 } as never, [0]);
  assert.deepEqual(view.certificates, [
    { key: 'oeko_tex_100', docPosition: 0, documented: true },
    { key: 'bsci', docPosition: null, documented: false },
  ]);
  const noDoc = toProductionView(data as never, []);
  assert.equal(noDoc.certificates[0].documented, false);
});

test('referans: paylaşma izni zorunlu', () => {
  const img = 'data:image/jpeg;base64,AAAA';
  assert.deepEqual(checkReference({ imageUrl: img, permissionConfirmed: false }), { ok: false, error: 'permission_required' });
  assert.equal(checkReference({ imageUrl: img }).ok, false);
  assert.equal(checkReference({ imageUrl: 'http://x', permissionConfirmed: true }).ok, false);
  const ok = checkReference({ imageUrl: img, permissionConfirmed: true, showClient: true });
  assert.equal(ok.ok, true);
  // Müşteri adı yoksa gösterim bayrağı kapanır.
  if (ok.ok) assert.equal(ok.data.showClient, false);
});

test('referans: sıra boşlukları doldurur, 12 dolunca null', () => {
  assert.equal(nextFreePosition([]), 0);
  assert.equal(nextFreePosition([0, 2]), 1);
  assert.equal(nextFreePosition([...Array(MAX_PRODUCTION_REFERENCES).keys()]), null);
});
