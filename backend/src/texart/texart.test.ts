import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { CATALOG_SIZE, runPipeline } from './pipeline';
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

test('texart: çıktılar standart boyutta, EXIF yönü uygulanır, kayıt tutulur', async () => {
  // 1200x800 yatay görsel, EXIF 6 (90° döndür) → gerçek yön 800x1200 dikey.
  const img = await texture(1200, 800, [200, 40, 60]).jpeg({ quality: 95 }).withMetadata({ orientation: 6 }).toBuffer();
  const r = await runPipeline(img);
  assert.equal(r.durum, 'tamam', JSON.stringify(r.islem_kaydi));
  if (r.durum !== 'tamam') return;
  assert.deepEqual(r.boyut, { width: 800, height: 1200 });
  const k = await sharp(r.ciktilar.katalog).metadata();
  assert.equal(k.width, CATALOG_SIZE);
  assert.equal(k.height, CATALOG_SIZE);
  assert.equal(r.ciktilar.katalog_2x, undefined); // kaynak kırpımı < 896 px → 2048 üretilmez
  const y = await sharp(r.ciktilar.yakin_plan).metadata();
  assert.ok(y.width! <= 800 && y.width! >= 600, `yakın plan büyütmez: ${y.width}`); // kaynak kısa kenarı 800, güvenlik payı düşülür
  assert.match(r.renkler[0].hex, /^#[0-9A-F]{6}$/);
  assert.equal(r.renkler[0].ad, 'kırmızı');
  const adimlar = r.islem_kaydi.map((e) => e.adim);
  for (const a of ['kalite_kapisi', 'ayirma', 'perspektif', 'isik_dengeleme', 'beyaz_dengesi', 'duz_bolge', 'olcek', 'doku_belirginlestirme', 'cozunurluk', 'kompozisyon', 'sadakat_olcumu'])
    assert.ok(adimlar.includes(a), `işlem kaydında ${a} yok`);
  assert.equal(typeof r.olcumler.doku_ssim, 'number');
});

test('texart kalite kapısı: bulanık fotoğraf yeniden çekim ister', async () => {
  const img = await texture(1600, 1600, [180, 170, 160]).blur(8).jpeg().toBuffer();
  const r = await runPipeline(img);
  assert.equal(r.durum, 'yeniden_cekim');
  if (r.durum !== 'yeniden_cekim') return;
  assert.equal(r.neden, 'bulanik');
  assert.match(r.mesaj, /bulanık/);
  assert.ok(r.uyarilar.includes('yeniden_cekim:bulanik'));
});

test('texart kalite kapısı: çok küçük kaynak yeniden çekim ister (büyütme > 2×)', async () => {
  const img = await texture(300, 300, [120, 120, 200]).png().toBuffer();
  const r = await runPipeline(img);
  assert.equal(r.durum, 'yeniden_cekim');
  if (r.durum === 'yeniden_cekim') assert.equal(r.neden, 'cozunurluk_dusuk');
});

test('texart ayırma: zıt zemin üzerindeki kumaş karesi bulunur, kırpım kumaşın içinden alınır', async () => {
  const W = 1800;
  const fabric = await texture(1000, 1000, [40, 60, 160]).png().toBuffer();
  const img = await sharp({ create: { width: W, height: W, channels: 3, background: { r: 245, g: 245, b: 240 } } })
    .composite([{ input: fabric, left: 400, top: 400 }])
    .jpeg({ quality: 95 })
    .toBuffer();
  const r = await runPipeline(img);
  assert.equal(r.durum, 'tamam', JSON.stringify(r.islem_kaydi));
  if (r.durum !== 'tamam') return;
  const ayirma = r.islem_kaydi.find((e) => e.adim === 'ayirma')!;
  const alan = ayirma.olcum!.alan_orani as number;
  assert.ok(alan > 0.25 && alan < 0.36, `alan oranı ${alan} (beklenen ≈ 0.31 = 1000²/1800² − güvenlik payı)`);
  // Katalog: kenar boşluğu nötr zemin, içerik mavi kumaş (beyaz zemin sızmamış).
  const { data, info } = await sharp(r.ciktilar.katalog).raw().toBuffer({ resolveWithObject: true });
  const px = (x: number, y: number) => [data[(y * info.width + x) * 3], data[(y * info.width + x) * 3 + 1], data[(y * info.width + x) * 3 + 2]];
  const corner = px(10, 10);
  assert.ok(corner[0] > 220 && corner[1] > 220, 'köşe nötr zemin olmalı');
  for (const [x, y] of [[80, 80], [CATALOG_SIZE - 80, 80], [80, CATALOG_SIZE - 80], [CATALOG_SIZE - 80, CATALOG_SIZE - 80], [512, 512]]) {
    const p = px(x, y);
    assert.ok(p[2] > p[0] + 40 && p[2] > 90, `içerik (${x},${y}) kumaş mavisi olmalı: ${p}`);
  }
  assert.ok(['lacivert', 'indigo', 'gece mavisi'].includes(r.renkler[0].ad), r.renkler[0].ad);
});

test('texart beyaz dengesi: renk kayması nötre doğru, doz sınırı içinde, tek global dönüşüm', async () => {
  // Nötr gri kumaş, sarı iç mekân ışığı taklidi (mavi kanal düşük).
  const img = await texture(1600, 1600, [168, 170, 156]).jpeg({ quality: 95 }).toBuffer();
  const r = await runPipeline(img);
  assert.equal(r.durum, 'tamam');
  if (r.durum !== 'tamam') return;
  const wb = r.islem_kaydi.find((e) => e.adim === 'beyaz_dengesi')!;
  assert.equal(wb.durum, 'uygulandi');
  const kb = wb.olcum!.kazanc_b as number, kr = wb.olcum!.kazanc_r as number;
  assert.ok(kb > 1 && kb <= 1.12, `mavi kazancı ${kb}`);
  assert.ok(kr >= 0.88 && kr <= 1.12, `kırmızı kazancı ${kr}`);
  assert.ok((wb.doz ?? 0) <= 0.12);
  const { data, info } = await sharp(r.ciktilar.katalog).raw().toBuffer({ resolveWithObject: true });
  const i = (512 * info.width + 512) * 3;
  const fark = Math.abs(data[i] - data[i + 2]);
  assert.ok(fark < 8, `R−B farkı azalmalı (giriş 12): ${fark}`);
  // Bölgesel değişiklik yok: ΔE'nin parçalar arası sapması küçük.
  assert.ok((r.olcumler.dE2000_yerel_std as number) < 2, `yerel ΔE std ${r.olcumler.dE2000_yerel_std}`);
});

test('texart çözünürlük: yeterli kaynakta 2048 çıktı üretilir; doku SSIM yüksek kalır', async () => {
  const img = await texture(2600, 2600, [90, 140, 110]).jpeg({ quality: 95 }).toBuffer();
  const r = await runPipeline(img);
  assert.equal(r.durum, 'tamam');
  if (r.durum !== 'tamam') return;
  assert.ok(r.ciktilar.katalog_2x, '2048 çıktı bekleniyor');
  const m = await sharp(r.ciktilar.katalog_2x!).metadata();
  assert.equal(m.width, 2048);
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
