import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, SUMMARY_MAX } from './parse';
import { isTextileRelated, tagTopics } from './topics';
import { rankDigest } from './rank';
import { prepareEntries } from './fetch';

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel><title>Tekstil Haber</title>
<item>
  <title><![CDATA[Pamuk fiyatları &amp; iplik piyasası]]></title>
  <link>https://www.tekstilhaber.com/pamuk-fiyatlari/</link>
  <guid isPermaLink="false">https://www.tekstilhaber.com/?p=123</guid>
  <pubDate>Tue, 22 Sep 2026 08:30:00 +0300</pubDate>
  <description><![CDATA[<p>Pamuk <b>fiyatları</b> bu hafta yükseldi.</p><img src="x.jpg"/> ${'Uzun metin '.repeat(40)}]]></description>
  <content:encoded><![CDATA[<p>TAM MAKALE METNİ</p>]]></content:encoded>
</item>
<item>
  <title>Başlıksız bağlantı yok</title>
</item>
<item>
  <title>Encoded &lt;b&gt;HTML&lt;/b&gt; başlık</title>
  <link>https://example.com/a</link>
  <dc:date>2026-09-21T10:00:00Z</dc:date>
  <description>&lt;p&gt;Kodlanmış &amp;amp; özet&lt;/p&gt;</description>
</item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Knitting</title>
  <entry>
    <title type="html"><![CDATA[New circular knitting machine at ITMA]]></title>
    <link rel="enclosure" href="https://example.com/img.jpg"/>
    <link rel="alternate" href="https://example.com/knit-1"/>
    <id>tag:example.com,2026:1</id>
    <updated>2026-09-20T12:00:00Z</updated>
    <summary>Launch of a machine.</summary>
  </entry>
</feed>`;

test('RSS: CDATA, varlıklar, HTML atılır, özet kısalır, tam metin alınmaz', () => {
  const items = parseFeed(RSS);
  assert.equal(items.length, 2);
  const a = items[0];
  assert.equal(a.title, 'Pamuk fiyatları & iplik piyasası');
  assert.equal(a.url, 'https://www.tekstilhaber.com/pamuk-fiyatlari/');
  assert.equal(a.guid, 'https://www.tekstilhaber.com/?p=123');
  assert.ok(a.summary.startsWith('Pamuk fiyatları bu hafta yükseldi.'));
  assert.ok(a.summary.length <= SUMMARY_MAX);
  assert.ok(!a.summary.includes('<') && !a.summary.includes('TAM MAKALE'));
  assert.equal(a.publishedAt?.toISOString(), '2026-09-22T05:30:00.000Z');
  const b = items[1];
  assert.equal(b.title, 'Encoded HTML başlık');
  assert.equal(b.summary, 'Kodlanmış & özet');
  assert.equal(b.guid, 'https://example.com/a');
  assert.equal(b.publishedAt?.toISOString(), '2026-09-21T10:00:00.000Z');
});

test('Atom: alternate bağlantı, id, updated', () => {
  const [e] = parseFeed(ATOM);
  assert.equal(e.title, 'New circular knitting machine at ITMA');
  assert.equal(e.url, 'https://example.com/knit-1');
  assert.equal(e.guid, 'tag:example.com,2026:1');
  assert.equal(e.publishedAt?.toISOString(), '2026-09-20T12:00:00.000Z');
});

test('konu etiketleme TR + EN, ekli kelimeler, varsayılan', () => {
  assert.deepEqual(tagTopics('Pamuk fiyatları yükseldi', ''), ['hammadde', 'fiyat']);
  assert.deepEqual(tagTopics('Hazır giyim ihracatı arttı', ''), ['ihracat', 'moda']);
  assert.ok(tagTopics('Recycled polyester for circular fashion', '').includes('surdurulebilirlik'));
  assert.ok(tagTopics('ITMA 2027 exhibition opens', '').includes('fuar'));
  assert.deepEqual(tagTopics('Genel kurul yapıldı', ''), ['is_dunyasi']);
  // kelime başı: "zamanında" "zam" sayılmaz ama... kelime içi eşleşme yok
  assert.ok(!tagTopics('Bir sözleşme imzalandı', 'kalemlik').includes('fiyat'));
});

test('genel kaynak süzgeci: yalnızca tekstil', () => {
  assert.ok(isTextileRelated('Tekstil ihracatında düşüş', ''));
  assert.ok(isTextileRelated('Otomotiv', 'hazır giyim sektörü de etkilendi'));
  assert.ok(!isTextileRelated('Otomotiv satışları arttı', 'Konut kredisi faizleri'));
  const src = { key: 'dunya', name: 'Dünya', url: 'x', lang: 'tr' as const, textileFilter: true };
  const now = new Date('2026-09-24T00:00:00Z');
  const out = prepareEntries(src, [
    { guid: '1', url: 'https://a/1', title: 'Tekstilde yeni dönem', summary: '', publishedAt: new Date('2026-09-23T00:00:00Z') },
    { guid: '2', url: 'https://a/2', title: 'Borsa günü yükselişle kapattı', summary: '', publishedAt: new Date('2026-09-23T00:00:00Z') },
    { guid: '3', url: 'https://a/3', title: 'Tekstil eski haber', summary: '', publishedAt: new Date('2026-07-01T00:00:00Z') },
  ], now);
  assert.deepEqual(out.map((o) => o.guid), ['1']);
});

test('sıralama: firma türü, yenilik, kaynak çeşitliliği', () => {
  const now = new Date('2026-09-24T12:00:00Z');
  const h = (x: number) => new Date(now.getTime() - x * 3600_000);
  const items = [
    { id: 'moda1', source: 'A', lang: 'tr', title: 'Moda 1', topics: ['moda'], publishedAt: h(2) },
    { id: 'moda2', source: 'A', lang: 'tr', title: 'Moda 2', topics: ['moda'], publishedAt: h(3) },
    { id: 'moda3', source: 'A', lang: 'tr', title: 'Moda 3', topics: ['moda'], publishedAt: h(4) },
    { id: 'iplik1', source: 'B', lang: 'tr', title: 'İplik 1', topics: ['hammadde', 'fiyat'], publishedAt: h(5) },
    { id: 'eski', source: 'C', lang: 'en', title: 'Old', topics: ['hammadde'], publishedAt: h(24 * 20) },
    { id: 'genel', source: 'D', lang: 'tr', title: 'Genel', topics: ['is_dunyasi'], publishedAt: h(1) },
  ];
  const konf = rankDigest(items, 'konfeksiyon', now, 5);
  assert.equal(konf[0].id, 'moda1');
  assert.equal(konf.filter((i) => i.source === 'A').length, 2, 'kaynak başına en fazla 2');
  const iplik = rankDigest(items, 'iplik', now, 5);
  assert.equal(iplik[0].id, 'iplik1');
  assert.equal(iplik.length, 5);
  // Türkçe ve yeni, İngilizce ve eski olana göre önde
  const trNew = rankDigest(items, '', now, 6);
  assert.ok(trNew.findIndex((i) => i.id === 'genel') < trNew.findIndex((i) => i.id === 'eski'));
});
