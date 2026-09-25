import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { CATALOG_SIZE, runPipeline } from './pipeline';
import { publicFilePath } from './store';

test('texart iskelet: çıktılar standart boyutta, EXIF yönü uygulanır, kayıt tutulur', async () => {
  // 1200x800 yatay görsel, EXIF 6 (90° döndür) → gerçek yön 800x1200 dikey.
  const img = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 200, g: 40, b: 60 } } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const r = await runPipeline(img);
  assert.equal(r.durum, 'tamam');
  if (r.durum !== 'tamam') return;
  assert.deepEqual(r.boyut, { width: 800, height: 1200 });
  const k = await sharp(r.ciktilar.katalog).metadata();
  assert.equal(k.width, CATALOG_SIZE);
  assert.equal(k.height, CATALOG_SIZE);
  const y = await sharp(r.ciktilar.yakin_plan).metadata();
  assert.equal(y.width, 800); // yakın plan büyütmez: kaynak kısa kenarı 800
  assert.match(r.renkler[0].hex, /^#[0-9A-F]{6}$/);
  assert.ok(r.islem_kaydi.length >= 1);
});

test('texart: bozuk görsel hata verir', async () => {
  await assert.rejects(runPipeline(Buffer.from('not an image')));
});

test('texart dosya adı beyaz listesi: yol dışına çıkılamaz', () => {
  assert.equal(publicFilePath('abcdefghij12', '../secret.json'), null);
  assert.equal(publicFilePath('../../etc', 'katalog.jpg'), null);
  assert.equal(publicFilePath('abcdefghij12', 'baska.jpg'), null);
});
