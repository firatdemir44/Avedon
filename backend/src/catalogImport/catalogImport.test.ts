import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { parseProductPage, stripSizeSuffix, htmlToLines } from './parse';
import { mapParsed, mapSubtype, mapType, mapUsages, buildNote, missingRequired } from './map';
import { isAllowed, normalizeStartUrl, parseRobots } from './fetcher';
import {
  detectCurrency,
  findHeader,
  matchHeader,
  parseLeadTime,
  parseNumber,
  readImportFile,
  readTable,
  recordToItem,
  rowsToRecords,
  splitImportFile,
} from './fileImport';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name));
const PAGE_URL = 'https://catalog.melide.com.tr/product/crepe-supreme/';

test('ürün sayfası: etiketler yalnızca ana bloktan okunur', () => {
  const p = parseProductPage(fixture('melide-crepe-supreme.html').toString('utf8'), PAGE_URL);
  assert.equal(p.name, 'Crepe Supreme');
  assert.equal(p.code, 'MLD-Y0458'); // benzer üründeki MLD-R0093A değil
  assert.equal(p.typeText, 'Knitted Fabrics');
  assert.equal(p.weightGsm, 166);
  assert.equal(p.widthCm, 160);
  assert.equal(p.compositionText, '%92 PES %8 EA');
  assert.deepEqual(p.uses, ['APPAREL', 'FASHION', 'SPORTS', 'ACTIVE', 'FITNESS']);
});

test('ürün sayfası: galeri tam boy, en çok 4, logo/boyut ekli kopya yok', () => {
  const p = parseProductPage(fixture('melide-crepe-supreme.html').toString('utf8'), PAGE_URL);
  assert.ok(p.images.length >= 1 && p.images.length <= 4);
  for (const img of p.images) {
    assert.match(img.url, /\/wp-content\/uploads\/2019\/07\/IMG_\d+-1\.jpg$/);
    assert.doesNotMatch(img.url, /logo|favicon|slider|-\d+x\d+\./);
  }
  assert.equal(p.images[0].url, 'https://catalog.melide.com.tr/wp-content/uploads/2019/07/IMG_7718-1.jpg');
  assert.equal(p.images[0].smallUrl, 'https://catalog.melide.com.tr/wp-content/uploads/2019/07/IMG_7718-1-600x400.jpg');
  assert.equal(new Set(p.images.map((i) => i.url)).size, p.images.length);
});

test('Türkçe etiketler ve satır içi kullanım listesi', () => {
  const html = `<main><h1>Süprem 30/1</h1><table><tr><th>Ürün Kodu</th><td>AB-12</td></tr><tr><th>Ürün Tipi</th><td>Örme</td></tr>
    <tr><th>Gramaj</th><td>180 gr/m²</td></tr><tr><th>En</th><td>1,80 m</td></tr><tr><th>İçerik</th><td>%95 Pamuk %5 Elastan</td></tr>
    <tr><th>Kullanım</th><td>Tişört | Çocuk | Dış Giyim</td></tr></table></main>`;
  const p = parseProductPage(html, 'https://ornek.com.tr/urun/ab-12');
  assert.equal(p.code, 'AB-12');
  assert.equal(p.weightGsm, 180);
  assert.equal(p.widthCm, 180);
  assert.deepEqual(p.uses, ['TIŞÖRT', 'ÇOCUK', 'DIŞ GIYIM'].map((u) => u.toUpperCase()));
  const item = mapParsed(p, 'https://ornek.com.tr/urun/ab-12', 'p0');
  assert.equal(item.type, 'orme');
  assert.equal(item.subtype, 'suprem');
  assert.deepEqual(item.usages.sort(), ['cocuk_giyim', 'dis_giyim', 'tisortluk']);
});

test('eşleme: Melide ürünü Takyon modeline', () => {
  const p = parseProductPage(fixture('melide-crepe-supreme.html').toString('utf8'), PAGE_URL);
  const item = mapParsed(p, PAGE_URL, 'p0');
  assert.equal(item.type, 'orme');
  // "Crepe" dokumada krep, "Supreme" örmede süprem: çeşit örme olduğu için süprem.
  assert.equal(item.subtype, 'suprem');
  assert.deepEqual(item.usages, ['spor_giyim']);
  assert.deepEqual(item.unmappedUses, ['APPAREL', 'FASHION']);
  assert.deepEqual(missingRequired(item), []);
  assert.deepEqual(item.warnings, []);
  assert.equal(buildNote(item), 'Crepe Supreme · Kullanım: APPAREL, FASHION');
});

test('çeşit ve alt çeşit kuralları', () => {
  assert.equal(mapType('Knitted Fabrics'), 'orme');
  assert.equal(mapType('Raschel Lace'), 'raschel');
  assert.equal(mapType('Woven'), 'dokuma');
  assert.equal(mapType('Lace'), 'dantel');
  assert.equal(mapType('Accessories'), null);
  assert.equal(mapSubtype('Velvet Stretch', 'orme').subtype, 'kadife_orme');
  assert.equal(mapSubtype('Velvet', 'dokuma').subtype, 'kadife');
  assert.equal(mapSubtype('Kaşkorse 2x2', 'orme').subtype, 'kaskorse');
  assert.equal(mapSubtype('Interlock Soft', null).subtype, 'interlok');
  assert.equal(mapSubtype('Interlock Soft', null).inferredType, 'orme');
  assert.deepEqual(mapUsages(['SWIMWEAR', 'LINGERIE', 'LEGGINGS', 'FASHION']), {
    usages: ['mayoluk', 'ic_giyim', 'taytlik'],
    unmapped: ['FASHION'],
  });
});

test('boyut eki ve metin çıkarma yardımcıları', () => {
  assert.equal(stripSizeSuffix('https://x.com/a/IMG_1-600x400.jpg'), 'https://x.com/a/IMG_1.jpg');
  assert.deepEqual(htmlToLines('<p>A &amp; B</p><script>x()</script><li>C</li>'), ['A & B', 'C']);
});

test('robots.txt: Disallow, Allow ve Crawl-delay', () => {
  const r = parseRobots('User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\nCrawl-delay: 10\n');
  assert.equal(r.crawlDelayMs, 10_000);
  assert.equal(isAllowed(r, '/product/a/'), true);
  assert.equal(isAllowed(r, '/wp-admin/x'), false);
  assert.equal(isAllowed(r, '/wp-admin/admin-ajax.php'), true);
  const own = parseRobots('User-agent: *\nDisallow:\n\nUser-agent: TakyonBot\nDisallow: /\n');
  assert.equal(isAllowed(own, '/anything'), false);
});

test('başlangıç adresi: iç ağ ve geçersiz adresler reddedilir', () => {
  assert.equal(normalizeStartUrl('catalog.melide.com.tr'), 'https://catalog.melide.com.tr/');
  assert.throws(() => normalizeStartUrl('http://localhost:4000'));
  assert.throws(() => normalizeStartUrl('http://192.168.1.30/'));
  assert.throws(() => normalizeStartUrl('ftp://x.com'));
});

// --- Dosyadan aktarım ---

test('başlık eşleme sözlüğü (TR/EN)', () => {
  assert.equal(matchHeader('Ürün Kodu'), 'code');
  assert.equal(matchHeader('Artikel'), 'code');
  assert.equal(matchHeader('Gramaj (gr/m2)'), 'weight');
  assert.equal(matchHeader('GSM'), 'weight');
  assert.equal(matchHeader('En (cm)'), 'width');
  assert.equal(matchHeader('Composition'), 'composition');
  assert.equal(matchHeader('Fiyat (USD/kg)'), 'price');
  assert.equal(matchHeader('Lead time'), 'leadTime');
  assert.equal(matchHeader('Renk Kartı'), null);
});

test('sayı, para birimi, termin ayrıştırma', () => {
  assert.equal(parseNumber('4,50'), 4.5);
  assert.equal(parseNumber('1.250'), 1250);
  assert.equal(parseNumber('1,250'), 1250);
  assert.equal(parseNumber('1.250,75 TL'), 1250.75);
  assert.equal(parseNumber('$4.5'), 4.5);
  assert.equal(detectCurrency('120 TL/m'), 'TRY');
  assert.equal(detectCurrency('€ 3'), 'EUR');
  assert.equal(detectCurrency('120'), '');
  assert.equal(parseLeadTime('3 hafta'), 21);
  assert.equal(parseLeadTime('10 gün'), 10);
});

test('CSV: başlık satırı bulunur, satırlar ürüne çevrilir', async () => {
  const dataUrl = `data:text/csv;base64,${fixture('urun-listesi.csv').toString('base64')}`;
  const file = splitImportFile(dataUrl, 'urun-listesi.csv');
  assert.equal(file?.kind, 'csv');
  const rows = readTable(file as Extract<typeof file, { kind: 'csv' }> & { kind: 'csv' });
  const header = findHeader(rows)!;
  assert.equal(header.headers[0], 'Ürün Kodu');
  const records = rowsToRecords(rows, header);
  assert.equal(records.length, 3); // boş satır ve "Toplam" alınmaz
  const first = recordToItem(records[0], 'f0');
  assert.equal(first.code, 'MLD-Y0458');
  assert.equal(first.type, 'orme');
  assert.equal(first.subtype, 'suprem');
  assert.equal(first.weightGsm, 166);
  assert.deepEqual(first.usages, ['spor_giyim']);
  assert.deepEqual(first.commerce, { priceValue: 4.5, priceCurrency: 'USD', priceUnit: 'kg', stock: 1250, stockUnit: 'kg', moq: null, leadTimeDays: null });
  const second = recordToItem(records[1], 'f1');
  assert.equal(second.type, 'raschel');
  assert.equal(second.subtype, 'elastanli_tul');
  assert.deepEqual(second.usages, ['ic_giyim']);
  const third = recordToItem(records[2], 'f2');
  assert.equal(third.type, 'dokuma');
  assert.equal(third.subtype, 'poplin');
  assert.equal(third.commerce.priceValue, null);

  const read = await readImportFile(file!);
  assert.equal(read.records.length, 3);
  assert.ok(read.notices.some((n) => n.includes('Renk Kartı')));
});

test('XLSX: aynı tablo Excel dosyasından', async () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Code', 'Name', 'Type', 'Weight', 'Width', 'Composition', 'Price', 'Currency', 'MOQ', 'Lead time'],
      ['X-1', 'Interlock', 'Knitted', 220, 180, '100% Cotton', 3.2, 'EUR', 500, '2 weeks'],
    ]),
    'Liste'
  );
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const file = splitImportFile(`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${buf.toString('base64')}`, 'liste.xlsx');
  assert.equal(file?.kind, 'sheet');
  const read = await readImportFile(file!);
  assert.equal(read.records.length, 1);
  const item = recordToItem(read.records[0], 'f0');
  assert.equal(item.subtype, 'interlok');
  assert.equal(item.compositionText, '100% Cotton');
  assert.deepEqual(item.commerce, { priceValue: 3.2, priceCurrency: 'EUR', priceUnit: '', stock: null, stockUnit: 'm', moq: 500, leadTimeDays: 14 });
  assert.ok(item.warnings.every((w) => !w.includes('para birimi')));
});

test('para birimi belirsiz fiyat uyarı verir', () => {
  const item = recordToItem(
    { code: 'A', name: 'Süprem', typeText: 'Örme', weightText: '150', widthText: '180', compositionText: '%100 Pamuk', usesText: '', priceText: '120', currencyText: '', stockText: '', moqText: '', leadTimeText: '', priceHeader: 'Fiyat', stockHeader: '' },
    'f0'
  );
  assert.equal(item.commerce.priceValue, 120);
  assert.equal(item.commerce.priceCurrency, '');
  assert.ok(item.warnings.some((w) => w.includes('para birimi')));
});

test('desteklenmeyen dosya reddedilir', () => {
  assert.equal(splitImportFile('data:application/zip;base64,QUJD', 'a.zip'), null);
  assert.equal(splitImportFile('data:application/pdf;base64,QUJD', 'a.pdf')?.kind, 'pdf');
  assert.equal(splitImportFile('data:image/jpeg;base64,QUJD', 'a.jpg')?.kind, 'image');
});
