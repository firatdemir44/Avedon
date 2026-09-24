import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectsNewBulletin, fxContextLine, isStale, parseTcmbXml } from './fx';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="isokur.xsl"?>
<Tarih_Date Tarih="23.09.2026" Date="09/23/2026"  Bulten_No="2026/180" >
<Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
  <Unit>1</Unit><Isim>ABD DOLARI</Isim><CurrencyName>US DOLLAR</CurrencyName>
  <ForexBuying>48.7498</ForexBuying><ForexSelling>48.8377</ForexSelling>
  <BanknoteBuying>48.7157</BanknoteBuying><BanknoteSelling>48.9110</BanknoteSelling>
  <CrossRateUSD/><CrossRateOther/>
</Currency>
<Currency CrossOrder="1" Kod="AUD" CurrencyCode="AUD">
  <Unit>1</Unit><ForexBuying>32.1</ForexBuying><ForexSelling>32.3</ForexSelling>
</Currency>
<Currency CrossOrder="9" Kod="EUR" CurrencyCode="EUR">
  <Unit>1</Unit><ForexBuying>55.6519</ForexBuying><ForexSelling>55.7523</ForexSelling>
</Currency>
<Currency CrossOrder="10" Kod="GBP" CurrencyCode="GBP">
  <Unit>1</Unit><ForexBuying>64.1</ForexBuying><ForexSelling>64.4</ForexSelling>
</Currency>
</Tarih_Date>`;

test('TCMB XML: tarih ve USD/EUR/GBP döviz satış', () => {
  const p = parseTcmbXml(XML)!;
  assert.equal(p.date, '2026-09-23');
  assert.deepEqual(p.rates.map((r) => r.code), ['USD', 'EUR', 'GBP']);
  assert.equal(p.rates[0].forexSelling, 48.8377);
  assert.equal(p.rates[0].forexBuying, 48.7498);
  assert.equal(p.rates[1].forexSelling, 55.7523);
});

test('TCMB XML: bozuk girdi null', () => {
  assert.equal(parseTcmbXml('<html>hata</html>'), null);
  assert.equal(parseTcmbXml('<Tarih_Date Tarih="23.09.2026"></Tarih_Date>'), null);
});

test('yeni bülten beklentisi: hafta içi 15:35 sonrası', () => {
  // 2026-09-24 Perşembe. 15:40 İstanbul = 12:40 UTC
  assert.equal(expectsNewBulletin('2026-09-23', new Date('2026-09-24T12:40:00Z')), true);
  assert.equal(expectsNewBulletin('2026-09-23', new Date('2026-09-24T12:00:00Z')), false);
  assert.equal(expectsNewBulletin('2026-09-24', new Date('2026-09-24T14:00:00Z')), false);
  // Cumartesi
  assert.equal(expectsNewBulletin('2026-09-25', new Date('2026-09-26T14:00:00Z')), false);
  assert.equal(expectsNewBulletin(null), true);
});

test('bayat kur: 4 günden eski', () => {
  assert.equal(isStale('2026-09-18', new Date('2026-09-24T10:00:00Z')), true);
  assert.equal(isStale('2026-09-21', new Date('2026-09-24T10:00:00Z')), false);
});

test('asistan satırı', () => {
  const line = fxContextLine({ date: '2026-09-23', source: 'x', usd: 48.8377, eur: 55.7523, gbp: null, fetchedAt: '' });
  assert.match(line, /TCMB döviz satış, 23\.09\.2026\): 1 USD = 48,8377 TL, 1 EUR = 55,7523 TL/);
});
