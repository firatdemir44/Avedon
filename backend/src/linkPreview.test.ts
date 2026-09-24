import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIp, parseHtml, parseHttpUrl } from './linkPreview';

const OG_HTML = `<!doctype html><html><head>
<meta property="og:title" content="Pamuk fiyatları &amp; iplik piyasası" />
<meta property="og:description" content="Bu hafta pamuk fiyatları yüzde 3 arttı; iplikçiler stok yapıyor." />
<meta property="og:image" content="/img/pamuk.jpg" />
<meta property="og:site_name" content="Tekstil Haber" />
<title>Başka başlık | Tekstil Haber</title></head><body><p>Gövde</p></body></html>`;

const ORSAD_LIKE = `<html><head><meta charset="utf-8">
<meta name="description"  content="HAZIR GİYİM İHRACATINDA SERT DÜŞÜŞ ÖRSAD, Örme Sanayicileri Derneği">
<title>HAZIR GİYİM İHRACATINDA SERT DÜŞÜŞ - ÖRSAD - Örme Sanayicileri Derneği</title></head>
<body><header><img class="img-responsive logomd" src="/images/logo.png" alt="ÖRSAD"/></header>
<ul><li>Anasayfa</li><li>Haberler</li></ul>
<div class="haber-detay"><figure class="post-thumbnail"><img src="/resimler/resim_md_1.webp" alt="" /></figure>
<p class="text-gray-base"><div class="mdfont"><div>Türkiye ihracatının lokomotiflerinden olan hazır giyim sektörü, 2025’in ikinci çeyreğinde önemli bir gerileme yaşayarak son yılların en düşük seviyelerine indi. ${'Uzun metin '.repeat(40)}</div>
<div><br /></div><div>İkinci paragraf.</div></div></div>
<p>&copy; 2026, ÖRSAD - Örme Sanayicileri Derneği, Her Hakkı Saklıdır ve bu satır uzun bir telif satırıdır.</p>
<img src="/images/projed_logo.png" width="160" height="22"></body></html>`;

test('og etiketleri okunur, görsel mutlak adrese çevrilir', () => {
  const r = parseHtml(OG_HTML, new URL('https://www.tekstilhaber.com/haber/1'));
  assert.equal(r.title, 'Pamuk fiyatları & iplik piyasası');
  assert.equal(r.description, 'Bu hafta pamuk fiyatları yüzde 3 arttı; iplikçiler stok yapıyor.');
  assert.equal(r.siteName, 'Tekstil Haber');
  assert.equal(r.imageUrl, 'https://www.tekstilhaber.com/img/pamuk.jpg');
});

test('yalnızca <title> olan sayfa (ÖRSAD benzeri): başlık/site ayrılır, ilk paragraf ve içerik görseli', () => {
  const r = parseHtml(ORSAD_LIKE, new URL('https://www.orsad.org.tr/haber-detay/332-x.html'));
  assert.equal(r.title, 'HAZIR GİYİM İHRACATINDA SERT DÜŞÜŞ');
  assert.equal(r.siteName, 'ÖRSAD - Örme Sanayicileri Derneği');
  assert.match(r.description, /^Türkiye ihracatının lokomotiflerinden/);
  assert.ok(r.description.length <= 240, 'açıklama 240 karakteri aşmaz');
  assert.ok(r.description.endsWith('…'));
  assert.equal(r.imageUrl, 'https://www.orsad.org.tr/resimler/resim_md_1.webp');
});

test('hiç bilgi yoksa site adı alan adıdır', () => {
  const r = parseHtml('<html><body>kısa</body></html>', new URL('https://www.ornek.com.tr/a'));
  assert.equal(r.siteName, 'ornek.com.tr');
  assert.equal(r.title, '');
  assert.equal(r.imageUrl, null);
});

test('SSRF: özel/yerel adresler reddedilir', () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.3.1', '192.168.1.30', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'ff02::1', 'yanlis']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '185.12.4.3', '2a00:1450:4017:80b::200e']) assert.equal(isPrivateIp(ip), false, ip);
});

test('URL denetimi: yalnızca http/https ve genel adresler', () => {
  assert.ok(parseHttpUrl('https://www.orsad.org.tr/x'));
  for (const u of ['file:///etc/passwd', 'ftp://a.com', 'http://localhost:4000', 'http://127.0.0.1/', 'http://[::1]/', 'http://192.168.1.30:4000/api', 'http://user:pw@a.com', 'http://a.com:22/', 'javascript:alert(1)']) {
    assert.equal(parseHttpUrl(u), null, u);
  }
});
