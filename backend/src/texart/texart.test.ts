import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { runPipeline } from './pipeline';
import { publicFilePath } from './store';

// Sentetik "kumaş": taban rengi + rastgele ince doku (gerçek ilmek gibi ince ölçek enerjisi taşır).
function texture(w: number, h: number, rgb: [number, number, number], amp = 40, seed = 1) {
  const d = Buffer.alloc(w * h * 3);
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < w * h; i++) {
    const n = (rnd() - 0.5) * amp;
    for (let c = 0; c < 3; c++) d[i * 3 + c] = Math.max(0, Math.min(255, Math.round(rgb[c] + n)));
  }
  return sharp(d, { raw: { width: w, height: h, channels: 3 } });
}

test('texart: katalog görseli orijinal kadraj ve piksel boyutunda; EXIF yönü uygulanır; geometri değişmez', async () => {
  // 1200x800 yatay görsel, EXIF 6 (90° döndür) → gerçek yön 800x1200 dikey.
  const img = await texture(1200, 800, [200, 40, 60]).jpeg({ quality: 95 }).withMetadata({ orientation: 6 }).toBuffer();
  const r = await runPipeline(img);
  assert.equal(r.durum, 'tamam', JSON.stringify(r.islem_kaydi));
  if (r.durum !== 'tamam') return;
  assert.deepEqual(r.boyut, { width: 800, height: 1200 });
  const k = await sharp(r.ciktilar.katalog).metadata();
  assert.equal(k.width, 800);
  assert.equal(k.height, 1200); // kırpma/büyütme yok (Fırat 2026-09-26)
  assert.equal(r.ciktilar.katalog_2x, undefined);
  const y = await sharp(r.ciktilar.yakin_plan).metadata();
  assert.ok(y.width! <= 800, 'yakın plan büyütmez');
  assert.equal(r.renkler[0].ad, 'kırmızı');
  for (const a of ['perspektif', 'olcek']) assert.equal(r.islem_kaydi.find((e) => e.adim === a)?.durum, 'atlandi', a + ' kapalı olmalı');
  assert.equal(typeof r.olcumler.doku_ssim, 'number');
});

test('texart kalite kapısı: bulanık fotoğraf yeniden çekim ister', async () => {
  const img = await texture(1600, 1600, [180, 170, 160]).blur(8).jpeg().toBuffer();
  const r = await runPipeline(img);
  assert.equal(r.durum, 'yeniden_cekim');
  if (r.durum !== 'yeniden_cekim') return;
  assert.equal(r.neden, 'bulanik');
  assert.match(r.mesaj, /bulanık/);
});

test('texart: kumaş dışındaki zemin de dahil kadraj aynen kalır; ölçüm kumaşın içinden', async () => {
  const W = 1800;
  const fabric = await texture(1000, 1000, [40, 60, 160]).png().toBuffer();
  const img = await sharp({ create: { width: W, height: W, channels: 3, background: { r: 245, g: 245, b: 240 } } })
    .composite([{ input: fabric, left: 400, top: 400 }])
    .jpeg({ quality: 95 })
    .toBuffer();
  const r = await runPipeline(img);
  assert.equal(r.durum, 'tamam', JSON.stringify(r.islem_kaydi));
  if (r.durum !== 'tamam') return;
  const alan = r.islem_kaydi.find((e) => e.adim === 'ayirma')!.olcum!.alan_orani as number;
  assert.ok(alan > 0.25 && alan < 0.36, 'alan oranı ' + alan);
  const { data, info } = await sharp(r.ciktilar.katalog).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, W);
  const px = (x: number, y: number) => [data[(y * info.width + x) * info.channels], data[(y * info.width + x) * info.channels + 1], data[(y * info.width + x) * info.channels + 2]];
  const corner = px(20, 20);
  assert.ok(corner[0] > 215 && corner[1] > 215, 'köşe zemin olarak kalmalı: ' + corner);
  const mid = px(900, 900);
  assert.ok(mid[2] > mid[0] + 40, 'orta kumaş mavisi: ' + mid);
  assert.ok(['lacivert', 'indigo', 'gece mavisi'].includes(r.renkler[0].ad), r.renkler[0].ad);
});

test('texart beyaz dengesi: renk kayması nötre doğru, doz sınırı içinde, tek global dönüşüm', async () => {
  const img = await texture(1600, 1600, [168, 170, 156]).jpeg({ quality: 95 }).toBuffer();
  const r = await runPipeline(img);
  assert.equal(r.durum, 'tamam');
  if (r.durum !== 'tamam') return;
  const wb = r.islem_kaydi.find((e) => e.adim === 'beyaz_dengesi')!;
  assert.equal(wb.durum, 'uygulandi');
  const kb = wb.olcum!.kazanc_b as number;
  assert.ok(kb > 1 && kb <= 1.12, 'mavi kazancı ' + kb);
  assert.ok((wb.doz ?? 0) <= 0.12);
  const { data, info } = await sharp(r.ciktilar.katalog).raw().toBuffer({ resolveWithObject: true });
  const i = (800 * info.width + 800) * info.channels;
  assert.ok(Math.abs(data[i] - data[i + 2]) < 8, 'R−B farkı azalmalı');
  assert.ok((r.olcumler.dE2000_yerel_std as number) < 2);
});

test('texart: büyük kaynak da aynı boyutta kalır; yakın plan 1024 yerel piksel', async () => {
  const img = await texture(2600, 2600, [90, 140, 110]).jpeg({ quality: 95 }).toBuffer();
  const r = await runPipeline(img);
  assert.equal(r.durum, 'tamam');
  if (r.durum !== 'tamam') return;
  const m = await sharp(r.ciktilar.katalog).metadata();
  assert.equal(m.width, 2600);
  const y = await sharp(r.ciktilar.yakin_plan).metadata();
  assert.equal(y.width, 1024);
  assert.ok((r.olcumler.doku_ssim as number) >= 0.9);
});

test('texart: bozuk görsel hata verir', async () => {
  await assert.rejects(runPipeline(Buffer.from('not an image')));
});

test('texart dosya adı beyaz listesi: yol dışına çıkılamaz', () => {
  assert.equal(publicFilePath('abcdefghij12', '../secret.json'), null);
  assert.equal(publicFilePath('../../etc', 'katalog.jpg'), null);
  assert.equal(publicFilePath('abcdefghij12', 'baska.jpg'), null);
});
