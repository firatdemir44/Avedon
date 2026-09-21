// Anonim fiyat / termin endeksi (Faz 3, Adım 6) uçtan uca API testi. Veriyi veritabanına kurar:
//   node --env-file=.env --import tsx scripts/test-price-index-api.ts
import { PrismaClient } from '@prisma/client';
import { signSessionToken } from '../src/auth';

const prisma = new PrismaClient();
const BASE = process.env.API_BASE ?? 'http://localhost:4000/api';
let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  HATA ${name}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 700));
  }
}

const get = async (path: string, token?: string) => {
  const res = await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};

async function main() {
  const suffix = Date.now().toString().slice(-6);
  // Kümeyi başka verilerden ayırmak için alışılmadık bir gramaj bandı: 9000-9020.
  const GSM = 9010;
  const companies = [];
  for (let i = 0; i < 6; i++) companies.push(await prisma.company.create({ data: { name: `Endeks ${i} ${suffix}`, taxId: `1${i}${suffix}`, companyCode: `EN${i}-${suffix}` } }));
  const buyer = await prisma.user.create({ data: { accountType: 'uretici', position: 'Test', firstName: 'Test', lastName: 'Alıcı', phone: `0501${suffix}`, phoneVerified: true, companyId: companies[5].id } });
  const sellerUser = await prisma.user.create({ data: { accountType: 'uretici', position: 'Test', firstName: 'Test', lastName: 'Satıcı', phone: `0502${suffix}`, phoneVerified: true, companyId: companies[0].id } });
  const [B, S0] = [buyer, sellerUser].map((u) => signSessionToken(u.id));
  const products = [];
  for (let i = 0; i < 5; i++) {
    products.push(
      await prisma.product.create({
        data: { companyId: companies[i].id, code: `EN-${suffix}-${i}`, type: 'orme', subtype: 'suprem', stock: 1, stockUnit: 'kg', weightGsm: GSM, widthCm: 100, content: '%100 Pamuk', compositions: { create: [{ position: 0, fiber: 'pamuk', percent: 100 }] } },
      })
    );
  }
  const quote = async (productIndex: number, price: number, opts: { unit?: string; currency?: string; lead?: number; daysAgo?: number; status?: string } = {}) => {
    const p = products[productIndex];
    const r = await prisma.quoteRequest.create({ data: { buyerId: buyer.id, buyerCompanyId: companies[5].id, sellerCompanyId: p.companyId, productId: p.id, quantity: 100, unit: 'kg', status: 'quoted' } });
    await prisma.quote.create({
      data: { requestId: r.id, sellerUserId: sellerUser.id, status: opts.status ?? 'sent', priceValue: price, priceCurrency: opts.currency ?? 'USD', priceUnit: opts.unit ?? 'kg', leadTimeDays: opts.lead ?? 10, sentAt: new Date(Date.now() - (opts.daysAgo ?? 1) * 24 * 60 * 60 * 1000) },
    });
    return r.id;
  };
  const base = products[0].id;

  try {
    console.log('Eşik altında hiçbir şey görünmez');
    check('oturumsuz 401', (await get(`/price-index/product/${base}`)).status === 401);
    for (let i = 0; i < 4; i++) { await quote(i, 3 + i * 0.1); await quote(i, 3.05 + i * 0.1); }
    const four = await get(`/price-index/product/${base}`, B);
    check('8 teklif ama 4 satıcı → kapalı', four.status === 200 && four.json?.available === false && four.json.bands.length === 0, four.json);
    check('kapalıyken fiyat sızmaz', !/"p25"|"median"/.test(JSON.stringify(four.json)));

    console.log('Eşik üstünde yalnızca aralık');
    await quote(4, 3.4, { lead: 20 });
    const open = await get(`/price-index/product/${base}`, B);
    const band = open.json?.bands?.[0];
    check('5 satıcı, 9 teklif → açık; USD/kg bandı', open.json?.available === true && band?.currency === 'USD' && band.unit === 'kg', open.json);
    check('çeyrekler sıralı ve ortanca 3,15-3,25 arasında', band && band.price.p25 <= band.price.median && band.price.median <= band.price.p75 && band.price.median >= 3.15 && band.price.median <= 3.25, band?.price);
    check('en düşük / en yüksek ve firma bilgisi dönmez', !/min|max|company|seller/i.test(JSON.stringify(open.json?.bands)) && !JSON.stringify(open.json).includes(companies[1].id));
    check('örnek sayısı kaba verilir ("8+")', band?.sampleSize === '8+', band?.sampleSize);
    check('termin bandı', band?.leadTimeDays?.median === 10, band?.leadTimeDays);
    check('küme etiketi okunur', /Örme · Süprem · ana lif Pamuk · 9000-9020 gr\/m²/.test(open.json?.cluster?.label ?? ''), open.json?.cluster);
    check('alıcının konumu yok (satıcı değil)', band?.myPosition === null);
    const seller = await get(`/price-index/product/${base}`, S0);
    check('en ucuz teklifleri veren satıcı kendi konumunu görür: bandın altında', seller.json?.bands?.[0]?.myPosition === 'below', seller.json?.bands?.[0]);

    console.log('Küme sınırları');
    await quote(1, 100, { daysAgo: 120 });
    await quote(2, 200, { status: 'draft' });
    const again = await get(`/price-index/product/${base}`, B);
    check('90 günden eski ve taslak teklifler girmez', again.json?.bands?.[0]?.price?.p75 < 4, again.json?.bands?.[0]?.price);
    // Metre fiyatı: 9010 gr/m² × 1 m en = 9,01 kg/m → 27,03 USD/m = 3,00 USD/kg
    await quote(3, 27.03, { unit: 'm' });
    const withMeter = await get(`/price-index/product/${base}`, B);
    check('metre fiyatı kg\'a çevrilip bandı bozmaz', withMeter.json?.bands?.[0]?.price?.p75 < 4, withMeter.json?.bands?.[0]?.price);
    await quote(0, 95, { currency: 'TRY' });
    const tr = await get(`/price-index/product/${base}`, B);
    check('eşiği tutmayan para birimi (TRY) hiç görünmez', tr.json?.bands?.length === 1 && tr.json.bands[0].currency === 'USD', tr.json?.bands);
    const otherBand = await prisma.product.create({ data: { companyId: companies[0].id, code: `EN-${suffix}-X`, type: 'orme', subtype: 'suprem', stock: 1, stockUnit: 'kg', weightGsm: GSM + 500, widthCm: 100, content: 'x' } });
    check('başka gramaj bandındaki ürün için veri yok', (await get(`/price-index/product/${otherBand.id}`, B)).json?.available === false);
    check('olmayan ürün 404', (await get('/price-index/product/yok', B)).status === 404);
  } finally {
    await prisma.quoteRequest.deleteMany({ where: { buyerId: buyer.id } });
    await prisma.product.deleteMany({ where: { companyId: { in: companies.map((c) => c.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: [buyer.id, sellerUser.id] } } });
    await prisma.company.deleteMany({ where: { id: { in: companies.map((c) => c.id) } } });
    await prisma.$disconnect();
  }

  console.log(`\nSonuç: ${passed} geçti, ${failed} başarısız`);
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
