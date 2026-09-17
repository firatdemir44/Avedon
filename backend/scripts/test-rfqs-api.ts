// Çoklu teklif isteme ve karşılaştırma (Faz 3, Adım 1) uçtan uca API testi.
//   node --env-file=.env --import tsx scripts/test-rfqs-api.ts
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
    console.log(`  HATA ${name}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 600));
  }
}

async function api(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function main() {
  const suffix = Date.now().toString().slice(-6);
  const mkCo = (n: string, i: number) => prisma.company.create({ data: { name: `${n} ${suffix}`, taxId: `5${i}${suffix}`, companyCode: `RF${i}-${suffix}` } });
  const cos = [await mkCo('Satıcı A', 1), await mkCo('Satıcı B', 2), await mkCo('Satıcı C', 3), await mkCo('Alıcı Firma', 4)];
  const mk = (phone: string, companyId: string | null) =>
    prisma.user.create({ data: { accountType: 'uretici', position: 'Test', firstName: 'Test', lastName: phone, phone, phoneVerified: true, companyId } });
  const users = [await mk(`0541${suffix}`, cos[0].id), await mk(`0542${suffix}`, cos[1].id), await mk(`0543${suffix}`, cos[2].id), await mk(`0544${suffix}`, cos[3].id)];
  const [SA, SB, SC, B] = users.map((u) => signSessionToken(u.id));
  // 200 gr/m², 160 cm → 1 m = 0,32 kg
  const mkP = (companyId: string, code: string, extra: object = {}) =>
    prisma.product.create({ data: { companyId, code: `${code}-${suffix}`, type: 'orme', subtype: 'suprem', stock: 1000, stockUnit: 'kg', weightGsm: 200, widthCm: 160, content: '%100 Pamuk', ...extra } });
  const pA = await mkP(cos[0].id, 'A1');
  const pA2 = await mkP(cos[0].id, 'A2');
  const pB = await mkP(cos[1].id, 'B1');
  const pC = await mkP(cos[2].id, 'C1');
  const pOwn = await mkP(cos[3].id, 'OWN');

  const sendQuote = async (token: string, requestId: string, q: object) => {
    await api('POST', `/quotes/requests/${requestId}/draft`, token);
    await api('PUT', `/quotes/requests/${requestId}/quote`, token, q);
    return api('POST', `/quotes/requests/${requestId}/quote/send`, token);
  };

  try {
    console.log('Oluşturma');
    check('tek ürün 400', (await api('POST', '/rfqs', B, { productIds: [pA.id], quantity: 1000, unit: 'kg' })).status === 400);
    check('aynı firmanın iki ürünü = tek firma → 400 need_two_companies', (await api('POST', '/rfqs', B, { productIds: [pA.id, pA2.id], quantity: 1000, unit: 'kg' })).json?.error === 'need_two_companies');
    const made = await api('POST', '/rfqs', B, { productIds: [pA.id, pA2.id, pB.id, pC.id, pOwn.id, 'yok'], quantity: 1000, unit: 'kg', note: 'Eylül sonu sevk' });
    check('3 firmaya gitti', made.status === 201 && made.json?.rfq?.requestCount === 3, made.json);
    const reasons = Object.fromEntries((made.json?.skipped ?? []).map((s: any) => [s.productId, s.reason]));
    check('atlananlar nedenleriyle', reasons[pA2.id] === 'same_company' && reasons[pOwn.id] === 'own_product' && reasons['yok'] === 'not_found', made.json?.skipped);
    const rfqId = made.json.rfq.id as string;
    const reqOf = (pid: string) => made.json.rfq.rows.find((r: any) => r.product.id === pid)?.requestId as string;
    check('tekrar gönderim: açık istek varken atlanır', (await api('POST', '/rfqs', B, { productIds: [pA.id, pB.id], quantity: 5, unit: 'kg' })).json?.error === 'need_two_companies');

    console.log('Satıcı tarafı: çoklu olduğu belli olmaz');
    const sellerList = await api('GET', '/quotes/requests?role=seller', SA);
    const sellerRow = sellerList.json?.requests?.find((r: any) => r.id === reqOf(pA.id));
    check('satıcı isteği görür, rfqId görmez', !!sellerRow && sellerRow.rfqId === null && !JSON.stringify(sellerRow).includes(rfqId), sellerRow);
    const note = (await api('GET', '/notifications', SA)).json?.notifications?.find((n: any) => n.data?.quoteRequestId === reqOf(pA.id));
    check('bildirim tekil istekle aynı', note?.kind === 'quote_request_new' && !JSON.stringify(note).includes(rfqId), note);
    check('satıcı karşılaştırmayı açamaz 404', (await api('GET', `/rfqs/${rfqId}`, SA)).status === 404);
    check('alıcının istek satırında rfqId var', (await api('GET', `/quotes/requests/${reqOf(pA.id)}`, B)).json?.request?.rfqId === rfqId);

    console.log('Karşılaştırma');
    await sendQuote(SA, reqOf(pA.id), { priceValue: 8, priceCurrency: 'USD', priceUnit: 'kg', leadTimeDays: 20, moq: 300, moqUnit: 'kg' });
    // B metre fiyatı verir: 2,4 USD/m → 2,4 / 0,32 = 7,5 USD/kg
    await sendQuote(SB, reqOf(pB.id), { priceValue: 2.4, priceCurrency: 'USD', priceUnit: 'm', leadTimeDays: 12, moq: 2000, moqUnit: 'kg' });
    const cmp = await api('GET', `/rfqs/${rfqId}`, B);
    const row = (pid: string) => cmp.json?.rfq?.rows?.find((r: any) => r.product.id === pid);
    check('kısmi yanıt: 3 istekten 2 teklif', cmp.json?.rfq?.quotedCount === 2 && row(pC.id)?.quote === null, cmp.json?.rfq);
    check('metre fiyatı kg\'a çevrildi (7,5) ve işaretlendi', row(pB.id)?.quote?.comparablePrice?.value === 7.5 && row(pB.id).quote.comparablePrice.converted === true && row(pB.id).quote.comparablePrice.unit === 'kg', row(pB.id)?.quote);
    check('en düşük fiyat B, A değil', row(pB.id)?.flags?.includes('lowest_price') && !row(pA.id)?.flags?.includes('lowest_price'));
    check('en kısa termin B', row(pB.id)?.flags?.includes('fastest'));
    check('tahmini toplam = 7,5 × 1000', row(pB.id)?.quote?.estimatedTotal?.value === 7500);
    check('MOQ ihtiyacın üstünde uyarısı (B: 2000 > 1000)', row(pB.id)?.quote?.moqAboveQuantity === true && row(pA.id)?.quote?.moqAboveQuantity === false);
    check('firma bilgisi: doğrulama + referans sayısı', row(pA.id)?.company?.confirmedReferenceCount === 0 && 'verification' in (row(pA.id)?.company ?? {}));

    console.log('Farklı para birimi karışmaz');
    await sendQuote(SC, reqOf(pC.id), { priceValue: 100, priceCurrency: 'TRY', priceUnit: 'kg', leadTimeDays: 30 });
    const cmp2 = await api('GET', `/rfqs/${rfqId}`, B);
    const rowC = cmp2.json?.rfq?.rows?.find((r: any) => r.product.id === pC.id);
    check('TRY teklif USD ile kıyaslanmaz (tek başına işaret almaz)', !rowC?.flags?.includes('lowest_price') && cmp2.json?.rfq?.currencies?.length === 2, cmp2.json?.rfq?.currencies);
    check('USD içinde en düşük hâlâ B', cmp2.json?.rfq?.rows?.find((r: any) => r.product.id === pB.id)?.flags?.includes('lowest_price'));

    console.log('Sızıntı ve liste');
    const sellerView = JSON.stringify((await api('GET', `/quotes/requests/${reqOf(pA.id)}`, SA)).json);
    check('satıcı A, B\'nin fiyatını göremez', !sellerView.includes('2.4') && !sellerView.includes('7.5'));
    check('B\'nin isteğini A açamaz 404', (await api('GET', `/quotes/requests/${reqOf(pB.id)}`, SA)).status === 404);
    const list = await api('GET', '/rfqs', B);
    check('listede sayaçlar', list.json?.rfqs?.[0]?.id === rfqId && list.json.rfqs[0].requestCount === 3 && list.json.rfqs[0].quotedCount === 3, list.json?.rfqs?.[0]);
    check('başkasının listesi boş', (await api('GET', '/rfqs', SA)).json?.rfqs?.length === 0);

    console.log('Kabul ve ret karşılaştırmada görünür');
    await api('POST', `/quotes/requests/${reqOf(pB.id)}/respond`, B, { action: 'accept' });
    await api('POST', `/quotes/requests/${reqOf(pA.id)}/respond`, B, { action: 'decline' });
    const cmp3 = await api('GET', `/rfqs/${rfqId}`, B);
    const st = (pid: string) => cmp3.json?.rfq?.rows?.find((r: any) => r.product.id === pid)?.quote?.status;
    check('durumlar: B accepted, A declined', st(pB.id) === 'accepted' && st(pA.id) === 'declined', [st(pA.id), st(pB.id)]);

    console.log('Günlük sınır');
    const bulk = [];
    for (let i = 0; i < 27; i++) bulk.push({ buyerId: users[3].id, sellerCompanyId: cos[0].id, productId: pA2.id, quantity: 1, unit: 'kg', status: 'cancelled' });
    await prisma.quoteRequest.createMany({ data: bulk });
    const pA3 = await mkP(cos[0].id, 'A3');
    const pB3 = await mkP(cos[1].id, 'B3');
    const lim = await api('POST', '/rfqs', B, { productIds: [pA3.id, pB3.id], quantity: 10, unit: 'kg' });
    check('30 sınırı: 429 + kalan hak', lim.status === 429 && lim.json?.error === 'daily_limit' && lim.json?.remaining === 0, lim.json);
    check('tekil istek de sınıra takılır', (await api('POST', '/quotes/requests', B, { productId: pA3.id, quantity: 10, unit: 'kg' })).status === 429);
  } finally {
    const userIds = users.map((u) => u.id);
    const companyIds = cos.map((c) => c.id);
    await prisma.rfq.deleteMany({ where: { buyerId: { in: userIds } } });
    await prisma.quoteRequest.deleteMany({ where: { buyerId: { in: userIds } } });
    await prisma.product.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
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
