import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { runPipeline } from './pipeline';
import { deltaE2000, rgbToLab } from './steps/renk';
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

test('texart: kadraj aynen kalır; doldurma kapalıyken zemin korunur, ölçüm kumaşın içinden', async () => {
  const W = 1800;
  const fabric = await texture(1000, 1000, [40, 60, 160]).png().toBuffer();
  const img = await sharp({ create: { width: W, height: W, channels: 3, background: { r: 245, g: 245, b: 240 } } })
    .composite([{ input: fabric, left: 400, top: 400 }])
    .jpeg({ quality: 95 })
    .toBuffer();
  const r = await runPipeline(img, { doldurma: false });
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
  assert.equal(r.islem_kaydi.find((e) => e.adim === 'kenar_doldurma')?.durum, 'atlandi');
  assert.ok(!r.uyarilar.includes('kenar_kumasla_tamamlandi'));
});

// Periyodik sentetik kumaş: iki yönde sinüs çizgi + hafif rastgele doku (örgü tekrarı gibi).
function periodicFabric(w: number, h: number, base: [number, number, number], periyot = 24, amp = 22, seed = 3) {
  const d = Buffer.alloc(w * h * 3);
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = amp * (Math.sin((2 * Math.PI * x) / periyot) + 0.6 * Math.sin((2 * Math.PI * y) / periyot)) + (rnd() - 0.5) * 8;
      for (let c = 0; c < 3; c++) d[(y * w + x) * 3 + c] = Math.max(0, Math.min(255, Math.round(base[c] + v)));
    }
  return sharp(d, { raw: { width: w, height: h, channels: 3 } });
}

test('texart kenar doldurma: beyaz zemindeki kumaş kadrajı kendi dokusuyla tamamlar; maske içi piksel doldurmasız render ile birebir aynı', async () => {
  const W = 1600, F = 960; // kumaş kadrajın %60'ı (alan %36)
  const fabric = await periodicFabric(F, F, [50, 90, 170]).png().toBuffer();
  const img = await sharp({ create: { width: W, height: W, channels: 3, background: { r: 246, g: 246, b: 242 } } })
    .composite([{ input: fabric, left: (W - F) / 2, top: (W - F) / 2 }])
    .jpeg({ quality: 95 })
    .toBuffer();
  const [r, r0] = await Promise.all([runPipeline(img), runPipeline(img, { doldurma: false })]);
  assert.equal(r.durum, 'tamam', JSON.stringify(r.islem_kaydi));
  assert.equal(r0.durum, 'tamam');
  if (r.durum !== 'tamam' || r0.durum !== 'tamam') return;
  const kd = r.islem_kaydi.find((e) => e.adim === 'kenar_doldurma')!;
  assert.equal(kd.durum, 'uygulandi', JSON.stringify(kd));
  assert.equal(kd.risk, 'dikkat');
  assert.ok(r.uyarilar.includes('kenar_kumasla_tamamlandi'));
  const oran = r.olcumler.doldurulan_oran as number;
  assert.ok(oran > 0.55 && oran < 0.75, 'doldurulan oran ' + oran);
  assert.ok(typeof kd.olcum!.blok_px === 'number' && typeof kd.olcum!.dikis_hatasi_rms === 'number' && typeof kd.olcum!.kaynak_kenar === 'number');
  const a = await sharp(r.ciktilar.katalog).raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(r0.ciktilar.katalog).raw().toBuffer({ resolveWithObject: true });
  assert.equal(a.info.width, W);
  assert.equal(a.info.height, W);
  const px = (buf: Buffer, x: number, y: number) => [buf[(y * W + x) * 3], buf[(y * W + x) * 3 + 1], buf[(y * W + x) * 3 + 2]];
  // Dört köşe artık kumaş renginde (mavi baskın), beyaz değil.
  for (const [x, y] of [[24, 24], [W - 25, 24], [24, W - 25], [W - 25, W - 25]] as const) {
    const c = px(a.data, x, y);
    assert.ok(c[2] > c[0] + 40 && c[0] < 150, `köşe (${x},${y}) kumaş olmalı: ${c}`);
    const c0 = px(b.data, x, y);
    assert.ok(c0[0] > 215, `doldurmasız köşe zemin: ${c0}`);
  }
  // Kumaşın içi (merkez 128×128) doldurmasız render ile birebir aynı.
  let fark = 0;
  for (let y = W / 2 - 64; y < W / 2 + 64; y++)
    for (let x = W / 2 - 64; x < W / 2 + 64; x++) for (let c = 0; c < 3; c++) fark = Math.max(fark, Math.abs(a.data[(y * W + x) * 3 + c] - b.data[(y * W + x) * 3 + c]));
  assert.equal(fark, 0, 'maske içi piksel değişmemeli (en büyük fark ' + fark + ')');
  // Sadakat ölçümleri yalnız gerçek kumaş kırpımından: iki çalıştırmada aynı.
  assert.equal(r.olcumler.doku_ssim, r0.olcumler.doku_ssim);
  assert.equal(r.olcumler.dE2000_ort, r0.olcumler.dE2000_ort);
  // Doldurulan bölgede doku periyodu korunur: yatay sinüsün periyodu (24 px) köşede de görülür.
  const y0 = 40;
  const prof: number[] = [];
  for (let x = 0; x < 240; x++) prof.push(px(a.data, x, y0)[1]);
  const ort = prof.reduce((t, v) => t + v, 0) / prof.length;
  let bestLag = 0, bestCorr = -Infinity;
  for (let lag = 12; lag <= 40; lag++) {
    let t = 0;
    for (let x = 0; x + lag < prof.length; x++) t += (prof[x] - ort) * (prof[x + lag] - ort);
    if (t > bestCorr) { bestCorr = t; bestLag = lag; }
  }
  assert.ok(Math.abs(bestLag - 24) <= 1, 'doldurulan bölgede periyot ' + bestLag);
});

test('texart kenar doldurma: yarı saydam (file/tül) kumaşta doldurma yapılmaz, uyarı eklenir', async () => {
  // Kumaş: 4 px periyotlu koyu ızgara; ızgara aralarından beyaz zemin görünür (file gibi).
  const W = 1800, F = 1200;
  const d = Buffer.alloc(F * F * 3);
  for (let y = 0; y < F; y++)
    for (let x = 0; x < F; x++) {
      const iplik = x % 4 < 2 || y % 4 < 2;
      const c: [number, number, number] = iplik ? [0, 0, 40] : [246, 246, 242];
      for (let k = 0; k < 3; k++) d[(y * F + x) * 3 + k] = c[k];
    }
  const fabric = await sharp(d, { raw: { width: F, height: F, channels: 3 } }).png().toBuffer();
  const img = await sharp({ create: { width: W, height: W, channels: 3, background: { r: 246, g: 246, b: 242 } } })
    .composite([{ input: fabric, left: (W - F) / 2, top: (W - F) / 2 }])
    .jpeg({ quality: 95 })
    .toBuffer();
  const r = await runPipeline(img);
  assert.equal(r.durum, 'tamam', JSON.stringify(r.islem_kaydi));
  if (r.durum !== 'tamam') return;
  assert.ok(r.uyarilar.includes('yari_saydam_zemin_korundu'), r.uyarilar.join(','));
  const kd = r.islem_kaydi.find((e) => e.adim === 'kenar_doldurma')!;
  assert.equal(kd.durum, 'atlandi');
  assert.equal(kd.olcum!.neden, 'yari_saydam');
  assert.ok(r.uyarilar.includes('doldurma_yapilmadi:yari_saydam'));
  assert.ok(!r.uyarilar.includes('kenar_kumasla_tamamlandi'));
  assert.equal(r.olcumler.doldurulan_oran, 0);
  const { data, info } = await sharp(r.ciktilar.katalog).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, W);
  assert.ok(data[(20 * W + 20) * 3] > 215, 'köşe zemin kalmalı');
});

test("texart kenar doldurma: kumaş kadrajın %25'inden azsa kaynak yetersiz, doldurma yok", async () => {
  const W = 2000, F = 900; // alan %20
  const fabric = await texture(F, F, [150, 60, 70]).png().toBuffer();
  const img = await sharp({ create: { width: W, height: W, channels: 3, background: { r: 246, g: 246, b: 242 } } })
    .composite([{ input: fabric, left: (W - F) / 2, top: (W - F) / 2 }])
    .jpeg({ quality: 95 })
    .toBuffer();
  const r = await runPipeline(img);
  assert.equal(r.durum, 'tamam', JSON.stringify(r.islem_kaydi));
  if (r.durum !== 'tamam') return;
  const kd = r.islem_kaydi.find((e) => e.adim === 'kenar_doldurma')!;
  assert.equal(kd.durum, 'atlandi', JSON.stringify(kd));
  assert.equal(kd.olcum!.neden, 'kumas_alani_kucuk');
  assert.ok(r.uyarilar.includes('doldurma_yapilmadi:kumas_alani_kucuk'));
});

test('texart beyaz dengesi: soğuk (mavimsi) kayan nötr kumaş nötre doğru, doz sınırı içinde, tek global dönüşüm', async () => {
  const img = await texture(1600, 1600, [160, 163, 172]).jpeg({ quality: 95 }).toBuffer();
  const r = await runPipeline(img);
  assert.equal(r.durum, 'tamam');
  if (r.durum !== 'tamam') return;
  const wb = r.islem_kaydi.find((e) => e.adim === 'beyaz_dengesi')!;
  assert.equal(wb.durum, 'uygulandi', JSON.stringify(wb));
  assert.equal(wb.olcum!.referans, 'kumas');
  const kr = wb.olcum!.kazanc_r as number, kb = wb.olcum!.kazanc_b as number;
  assert.ok(kr > 1 && kr <= 1.12 && kb < 1, `kazançlar R ${kr} B ${kb}`);
  assert.ok((wb.doz ?? 0) <= 0.12);
  const { data, info } = await sharp(r.ciktilar.katalog).raw().toBuffer({ resolveWithObject: true });
  const i = (800 * info.width + 800) * info.channels;
  assert.ok(Math.abs(data[i] - data[i + 2]) < 8, 'R−B farkı azalmalı: ' + [data[i], data[i + 1], data[i + 2]]);
  assert.ok((r.olcumler.dE2000_yerel_std as number) < 2);
});

// Sentetik kumaşın kaynak ve çıktı merkezindeki ortalama Lab'ı.
async function ortaLab(buf: Buffer, boyut: number) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = boyut / 2 - 64; y < boyut / 2 + 64; y++)
    for (let x = boyut / 2 - 64; x < boyut / 2 + 64; x++) { const k = (y * info.width + x) * info.channels; r += data[k]; g += data[k + 1]; b += data[k + 2]; n++; }
  return rgbToLab(r / n, g / n, b / n);
}

test('texart beyaz dengesi: haki/bej gibi düşük kromalı ama sıcak tonlu kumaş griye çekilmez (referans yok → en fazla küçük doz)', async () => {
  // Haki: L≈52, a≈0, b≈+6 (ton ≈ 90°, kroma ≈ 6) — gerçek fotoğraftaki haki pike ile aynı bölgede.
  const img = await texture(1600, 1600, [128, 125, 112]).jpeg({ quality: 95 }).toBuffer();
  const r = await runPipeline(img);
  assert.equal(r.durum, 'tamam');
  if (r.durum !== 'tamam') return;
  const wb = r.islem_kaydi.find((e) => e.adim === 'beyaz_dengesi')!;
  assert.notEqual(wb.olcum!.referans, 'kumas', 'sıcak tonlu kumaş nötr referans olmamalı: ' + JSON.stringify(wb));
  assert.ok((wb.doz ?? 0) <= 0.03, 'doz ' + wb.doz);
  const once = await ortaLab(img, 1600), sonra = await ortaLab(r.ciktilar.katalog, 1600);
  const dE = deltaE2000(once, sonra);
  const kromaOnce = Math.hypot(once[1], once[2]), kromaSonra = Math.hypot(sonra[1], sonra[2]);
  assert.ok(dE <= 1.5, `haki kaydı ΔE ${dE.toFixed(2)}`);
  assert.ok(kromaSonra >= kromaOnce * 0.75, `kroma korunmalı: ${kromaOnce.toFixed(1)} → ${kromaSonra.toFixed(1)}`);
  assert.ok(sonra[2] > 3, 'sarı–zeytin ton (b*) kalmalı: ' + sonra[2].toFixed(1));
});

test('texart beyaz dengesi: kumaş dışı beyaz kâğıt/kart varsa nötr referans odur, kumaş rengi hesaba girmez', async () => {
  // Sıcak ışık altında beyaz kart (sarımsı) + haki kumaş: kart referans alınır, mavi kazancı > 1.
  const W = 1600, F = 1000;
  const fabric = await texture(F, F, [128, 125, 112]).png().toBuffer();
  const img = await sharp({ create: { width: W, height: W, channels: 3, background: { r: 238, g: 232, b: 214 } } })
    .composite([{ input: fabric, left: (W - F) / 2, top: (W - F) / 2 }])
    .jpeg({ quality: 95 })
    .toBuffer();
  const r = await runPipeline(img, { doldurma: false });
  assert.equal(r.durum, 'tamam', JSON.stringify(r.islem_kaydi));
  if (r.durum !== 'tamam') return;
  const wb = r.islem_kaydi.find((e) => e.adim === 'beyaz_dengesi')!;
  assert.equal(wb.durum, 'uygulandi', JSON.stringify(wb));
  assert.equal(wb.olcum!.referans, 'beyaz_yuzey');
  const kb = wb.olcum!.kazanc_b as number, kr = wb.olcum!.kazanc_r as number;
  assert.ok(kb > 1.02 && kb <= 1.12 && kr < 1, `kazançlar R ${kr} B ${kb}`);
  assert.ok((r.olcumler.beyaz_dengesi_dE as number) <= 3.05, 'beyaz yüzey referansında kumaş ΔE ≤ 3: ' + r.olcumler.beyaz_dengesi_dE);
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

test('texart kenar doldurma: zigzag (pinking) kesim kenarındaki beyaz boşluklar maskeye sızsa da doldurulur', async () => {
  // Kumaş kadrajın altına kadar iner; alt kenar zigzag kesimli, dişlerin arası beyaz zemin. Üstte beyaz kart başlığı.
  const W = 1600, UST = 320, T = 16, P = 32;
  const fabric = await periodicFabric(W, W - UST, [50, 90, 170]).raw().toBuffer();
  const d = Buffer.alloc(W * W * 3, 246);
  for (let y = UST; y < W; y++)
    for (let x = 0; x < W; x++) {
      const dis = W - 1 - y; // alt kenara uzaklık
      const tooth = T * Math.abs(((x % P) / (P / 2)) - 1); // 0..T üçgen dalga
      if (dis < tooth) continue; // beyaz boşluk
      const k = ((y - UST) * W + x) * 3;
      d[(y * W + x) * 3] = fabric[k]; d[(y * W + x) * 3 + 1] = fabric[k + 1]; d[(y * W + x) * 3 + 2] = fabric[k + 2];
    }
  const img = await sharp(d, { raw: { width: W, height: W, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
  const r = await runPipeline(img);
  assert.equal(r.durum, 'tamam', JSON.stringify(r.islem_kaydi));
  if (r.durum !== 'tamam') return;
  const kd = r.islem_kaydi.find((e) => e.adim === 'kenar_doldurma')!;
  assert.equal(kd.durum, 'uygulandi', JSON.stringify(kd));
  const { data } = await sharp(r.ciktilar.katalog).raw().toBuffer({ resolveWithObject: true });
  // Alt 12 satırda hiçbir piksel beyaz kalmamalı (kumaş mavi: R < 150).
  let beyaz = 0;
  for (let y = W - 12; y < W; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 3] > 200 && data[(y * W + x) * 3 + 1] > 200) beyaz++;
  assert.equal(beyaz, 0, 'alt kenarda beyaz piksel kaldı: ' + beyaz);
  // Üst kart alanı da kumaşla dolu.
  assert.ok(data[(20 * W + 800) * 3 + 2] > data[(20 * W + 800) * 3] + 40, 'üst alan kumaş olmalı');
});
