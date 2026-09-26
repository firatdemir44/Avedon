import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasApparelSignal, parseApparelQuery } from './apparelQuery';

test('"tayt aylık 50 bin oeko-tex" → tayt, kapasite ≥ 50.000, OEKO-TEX', () => {
  const q = parseApparelQuery('tayt aylık 50 bin oeko-tex');
  assert.equal(q.group, 'tayt');
  assert.equal(q.capacityMin, 50000);
  assert.equal(q.cert, 'oeko_tex_100');
  assert.deepEqual(q.rest, []);
});

test('"sütyen atölyesi bursa" → sütyen, atölye, Bursa', () => {
  const q = parseApparelQuery('sütyen atölyesi bursa');
  assert.equal(q.group, 'sutyen');
  assert.equal(q.kind, 'atolye');
  assert.equal(q.city, 'Bursa');
});

test('büyük harf, çoğul ve il eki: "TAYTLAR İSTANBUL\'da"', () => {
  const q = parseApparelQuery("TAYTLAR İSTANBUL'da");
  assert.equal(q.group, 'tayt');
  assert.equal(q.city, 'İstanbul');
});

test('ürün grubu eşanlamlıları', () => {
  const cases: [string, string][] = [
    ['iç çamaşırı', 'ic_camasiri'],
    ['ic camasir', 'ic_camasiri'],
    ['külot', 'ic_camasiri'],
    ['boxer', 'ic_camasiri'],
    ['bra', 'sutyen'],
    ['korse', 'sutyen'],
    ['bikini', 'mayo'],
    ['t-shirt', 'tisort'],
    ['tshirt', 'tisort'],
    ['tişört', 'tisort'],
    ['basic', 'tisort'],
    ['eşofman', 'sweatshirt'],
    ['sweat', 'sweatshirt'],
    ['aktif spor', 'aktif_spor'],
    ['activewear', 'aktif_spor'],
    ['ev giyim', 'pijama'],
    ['bebek', 'cocuk'],
    ['gömlek', 'gomlek'],
    ['denim', 'pantolon'],
    ['jean', 'pantolon'],
    ['dış giyim', 'dis_giyim'],
    ['kaban', 'dis_giyim'],
    ['elbise', 'abiye'],
    ['kazak', 'triko'],
  ];
  for (const [text, key] of cases) assert.equal(parseApparelQuery(text).group, key, text);
});

test('yazım hatası: "sütyn", "pijma", "esofmam"', () => {
  assert.equal(parseApparelQuery('sütyn').group, 'sutyen');
  assert.equal(parseApparelQuery('pijma').group, 'pijama');
  assert.equal(parseApparelQuery('esofmam').group, 'sweatshirt');
});

test('kapasite yazımları: "50.000 adet", "50k", "ayda 20 bin", "1,5 milyon"', () => {
  assert.equal(parseApparelQuery('50.000 adet tişört').capacityMin, 50000);
  assert.equal(parseApparelQuery('50k tayt').capacityMin, 50000);
  assert.equal(parseApparelQuery('ayda 20 bin mayo').capacityMin, 20000);
  assert.equal(parseApparelQuery('aylık en az 30 bin').capacityMin, 30000);
  assert.equal(parseApparelQuery('1,5 milyon').capacityMin, 1_500_000);
});

test('MOQ: "min 300", "moq 500", "en az 500 adet sipariş"', () => {
  assert.equal(parseApparelQuery('min 300').moqMax, 300);
  assert.equal(parseApparelQuery('moq 500 tayt').moqMax, 500);
  const q = parseApparelQuery('en az 500 adet sipariş');
  assert.equal(q.moqMax, 500);
  assert.equal(q.capacityMin, null);
  assert.deepEqual(q.rest, []);
});

test('termin: "30 günde", "termin 20 gün", "15gün"', () => {
  assert.equal(parseApparelQuery('30 günde teslim').leadMax, 30);
  assert.equal(parseApparelQuery('termin 20 gün').leadMax, 20);
  assert.equal(parseApparelQuery('15gün').leadMax, 15);
});

test('sertifikalar', () => {
  assert.equal(parseApparelQuery('oekotex').cert, 'oeko_tex_100');
  assert.equal(parseApparelQuery('OEKO TEX 100').cert, 'oeko_tex_100');
  assert.equal(parseApparelQuery('GOTS belgeli').cert, 'gots');
  assert.equal(parseApparelQuery('grs').cert, 'grs');
  assert.equal(parseApparelQuery('amfori').cert, 'bsci');
  assert.equal(parseApparelQuery('sedex').cert, 'sedex');
  assert.equal(parseApparelQuery('ISO 9001').cert, 'iso_9001');
});

test('hizmetler', () => {
  assert.equal(parseApparelQuery('baskı').service, 'baski');
  assert.equal(parseApparelQuery('nakışlı sweat').service, 'nakis');
  assert.equal(parseApparelQuery('yıkama').service, 'yikama');
  assert.equal(parseApparelQuery('ütü paket').service, 'utu_paket');
  assert.equal(parseApparelQuery('kalıp').service, 'modelhane');
  assert.equal(parseApparelQuery('overlok').service, 'overlok_recme');
});

test('tür: fason → atölye; koleksiyon/marka → koleksiyon', () => {
  assert.equal(parseApparelQuery('fason tişört').kind, 'atolye');
  assert.equal(parseApparelQuery('koleksiyon').kind, 'koleksiyon');
  assert.equal(parseApparelQuery('marka pijama').kind, 'koleksiyon');
});

test('karma sorgu ve kalan sözcükler', () => {
  const q = parseApparelQuery('Denizli GOTS tişört atölyesi aylık 100 bin moq 1000 termin 45 gün Örnek');
  assert.equal(q.city, 'Denizli');
  assert.equal(q.cert, 'gots');
  assert.equal(q.group, 'tisort');
  assert.equal(q.kind, 'atolye');
  assert.equal(q.capacityMin, 100000);
  assert.equal(q.moqMax, 1000);
  assert.equal(q.leadMax, 45);
  assert.deepEqual(q.rest, ['ornek']);
});

test('sinyal: yalnızca grup ya da tür varsa konfeksiyon araması açılır', () => {
  assert.equal(hasApparelSignal(parseApparelQuery('Bursa')), false);
  assert.equal(hasApparelSignal(parseApparelQuery('süprem 30/1')), false);
  assert.equal(hasApparelSignal(parseApparelQuery('tayt')), true);
});
