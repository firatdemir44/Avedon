// Sipariş kaydı ve karşılıklı değerlendirme (Faz 3, Adım 4) uçtan uca API testi:
//   node --env-file=.env --import tsx scripts/test-deals-api.ts
import { PrismaClient } from '@prisma/client';
import { signSessionToken } from '../src/auth';

const prisma = new PrismaClient();
const BASE = process.env.API_BASE ?? 'http://localhost:4000/api';
const DAY = 24 * 60 * 60 * 1000;
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
  const sellerCo = await prisma.company.create({ data: { name: `Sipariş Satıcı ${suffix}`, taxId: `31${suffix}`, companyCode: `SS-${suffix}` } });
  const buyerCo = await prisma.company.create({ data: { name: `Sipariş Alıcı ${suffix}`, taxId: `32${suffix}`, companyCode: `SA-${suffix}` } });
  const otherCo = await prisma.company.create({ data: { name: `Sipariş Yabancı ${suffix}`, taxId: `33${suffix}`, companyCode: `SY-${suffix}` } });
  const mk = (phone: string, companyId: string) =>
    prisma.user.create({ data: { accountType: 'uretici', position: 'Test', firstName: 'Test', lastName: phone, phone, phoneVerified: true, companyId } });
  const seller = await mk(`0521${suffix}`, sellerCo.id);
  const buyer = await mk(`0522${suffix}`, buyerCo.id);
  const stranger = await mk(`0523${suffix}`, otherCo.id);
  const [S, B, X] = [seller, buyer, stranger].map((u) => signSessionToken(u.id));
  const mkProduct = (code: string) =>
    prisma.product.create({ data: { companyId: sellerCo.id, code: `${code}-${suffix}`, type: 'orme', subtype: 'suprem', stock: 1000, stockUnit: 'kg', weightGsm: 200, widthCm: 160, content: '%100 Pamuk' } });
  const accept = async (productId: string, leadTimeDays: number | null) => {
    const r = await api('POST', '/quotes/requests', B, { productId, quantity: 500, unit: 'kg' });
    const id = r.json.request.id as string;
    await api('POST', `/quotes/requests/${id}/draft`, S);
    await api('PUT', `/quotes/requests/${id}/quote`, S, { priceValue: 8, priceCurrency: 'USD', priceUnit: 'kg', ...(leadTimeDays != null ? { leadTimeDays } : {}) });
    await api('POST', `/quotes/requests/${id}/quote/send`, S);
    return { requestId: id, res: await api('POST', `/quotes/requests/${id}/respond`, B, { action: 'accept' }) };
  };

  try {
    const p1 = await mkProduct('SP1');
    const p2 = await mkProduct('SP2');
    const p3 = await mkProduct('SP3');

    console.log('Kabul edilen teklif siparişe döner');
    const a1 = await accept(p1.id, 10);
    const dealId = a1.res.json?.dealId as string;
    check('kabul yanıtında dealId', typeof dealId === 'string', a1.res.json);
    const d0 = await api('GET', `/deals/${dealId}`, B);
    const agreed = new Date(d0.json?.deal?.agreedDeliveryDate ?? 0).getTime();
    check('durum açık; anlaşılan tarih = kabul + 10 gün (satıcının kendi termini)', d0.json?.deal?.status === 'acik' && Math.abs(agreed - (Date.now() + 10 * DAY)) < 60_000, d0.json?.deal);
    check('satıcı da görür, rolüyle', (await api('GET', `/deals/${dealId}`, S)).json?.deal?.role === 'seller');
    check('yabancı göremez 404', (await api('GET', `/deals/${dealId}`, X)).status === 404);
    check('teklif isteğinden siparişe geçiş', (await api('GET', `/deals/by-request/${a1.requestId}`, B)).json?.deal?.id === dealId);
    check('satıcıya bildirimde dealId', (await api('GET', '/notifications', S)).json?.notifications?.some((n: any) => n.kind === 'quote_accepted' && n.data?.dealId === dealId));
    check('listeler: alıcıda 1, satıcıda 1, yabancıda 0', (await api('GET', '/deals', B)).json?.deals?.length === 1 && (await api('GET', '/deals?role=seller', S)).json?.deals?.length === 1 && (await api('GET', '/deals?role=seller', X)).json?.deals?.length === 0);

    console.log('Teslim beyanı, itiraz, onay');
    check('teslimden önce değerlendirme yok 409', (await api('POST', `/deals/${dealId}/review`, B, { quality: 5, timing: 5, communication: 5 })).json?.error === 'not_completed');
    check('alıcı teslim beyan edemez 404', (await api('POST', `/deals/${dealId}/deliver`, B)).status === 404);
    check('ileri tarihli beyan 400', (await api('POST', `/deals/${dealId}/deliver`, S, { deliveredAt: new Date(Date.now() + 5 * DAY).toISOString() })).json?.error === 'future_date');
    check('beyan olmadan onay 409', (await api('POST', `/deals/${dealId}/confirm`, B)).status === 409);
    const del = await api('POST', `/deals/${dealId}/deliver`, S);
    check('satıcı teslim ettim der', del.json?.deal?.status === 'teslim_bildirildi' && !!del.json.deal.sellerDeliveredAt, del.json);
    check('alıcıya bildirim', (await api('GET', '/notifications', B)).json?.notifications?.some((n: any) => n.kind === 'deal_delivered' && n.data?.dealId === dealId));
    const dis = await api('POST', `/deals/${dealId}/dispute`, B, { note: 'Henüz elimize ulaşmadı' });
    check('alıcı itiraz eder; not satıcıya görünür', dis.json?.deal?.status === 'itiraz' && (await api('GET', `/deals/${dealId}`, S)).json?.deal?.disputeNote === 'Henüz elimize ulaşmadı');
    check('satıcı onaylayamaz 404', (await api('POST', `/deals/${dealId}/confirm`, S)).status === 404);
    await api('POST', `/deals/${dealId}/deliver`, S);
    const conf = await api('POST', `/deals/${dealId}/confirm`, B);
    check('yeniden beyan + onay → teslim edildi, zamanında (gecikme 0)', conf.json?.deal?.status === 'teslim_edildi' && conf.json.deal.lateDays === 0 && conf.json.deal.canReview === true, conf.json?.deal);
    check('teslimden sonra iptal edilemez 409', (await api('POST', `/deals/${dealId}/cancel`, B, {})).status === 409);

    console.log('Değerlendirme: ödeme sorusu yok, karşılıklı açılır');
    check('ödeme alanı kabul edilmez 400', (await api('POST', `/deals/${dealId}/review`, S, { communication: 5, seriousness: 5, payment: 1 })).status === 400);
    check('alıcı satıcı ölçütleriyle değerlendiremez 400', (await api('POST', `/deals/${dealId}/review`, B, { communication: 5, seriousness: 5 })).status === 400);
    check('puan 1-5 dışı 400', (await api('POST', `/deals/${dealId}/review`, B, { quality: 6, timing: 5, communication: 5 })).status === 400);
    const rb = await api('POST', `/deals/${dealId}/review`, B, { quality: 4, timing: 5, communication: 5, comment: 'Numuneye uygun geldi' });
    check('alıcı değerlendirdi', rb.status === 201 && rb.json?.deal?.myReview?.quality === 4 && rb.json.deal.canReview === false, rb.json);
    check('ikinci kez değerlendiremez 409', (await api('POST', `/deals/${dealId}/review`, B, { quality: 1, timing: 1, communication: 1 })).json?.error === 'already_reviewed');
    const sellerSees = await api('GET', `/deals/${dealId}`, S);
    check('satıcı, kendi yazmadan alıcının puanını GÖREMEZ (yalnızca "bekliyor")', sellerSees.json?.deal?.theirReview === null && sellerSees.json.deal.theirReviewPending === true && !JSON.stringify(sellerSees.json).includes('Numuneye uygun'), sellerSees.json?.deal);
    const rs = await api('POST', `/deals/${dealId}/review`, S, { communication: 5, seriousness: 4 });
    check('satıcı da yazınca ikisi birden açılır', rs.json?.deal?.theirReview?.quality === 4 && (await api('GET', `/deals/${dealId}`, B)).json?.deal?.theirReview?.seriousness === 4, rs.json?.deal);
    const stored = await prisma.dealReview.findMany({ where: { dealId } });
    check('hedef firmalar doğru kaydedildi', stored.find((r) => r.authorRole === 'buyer')?.targetCompanyId === sellerCo.id && stored.find((r) => r.authorRole === 'seller')?.targetCompanyId === buyerCo.id);

    console.log('Geç teslim, kendiliğinden onay, 14 gün kuralı');
    const a2 = await accept(p2.id, 5);
    const deal2 = a2.res.json.dealId as string;
    await prisma.deal.update({ where: { id: deal2 }, data: { agreedDeliveryDate: new Date(Date.now() - 4 * DAY), createdAt: new Date(Date.now() - 20 * DAY) } });
    await api('POST', `/deals/${deal2}/deliver`, S);
    check('gecikme günü hesaplanır (4)', (await api('GET', `/deals/${deal2}`, B)).json?.deal?.lateDays === 4);
    await prisma.deal.update({ where: { id: deal2 }, data: { updatedAt: new Date(Date.now() - 8 * DAY) } });
    const auto = await api('GET', `/deals/${deal2}`, S);
    check('alıcı 7 gün yanıt vermezse onaylanmış sayılır', auto.json?.deal?.status === 'teslim_edildi' && !!auto.json.deal.buyerConfirmedAt, auto.json?.deal);
    await api('POST', `/deals/${deal2}/review`, S, { communication: 3, seriousness: 3 });
    check('tek taraflı değerlendirme 14 günden önce kapalı', (await api('GET', `/deals/${deal2}`, B)).json?.deal?.theirReview === null);
    await prisma.deal.update({ where: { id: deal2 }, data: { buyerConfirmedAt: new Date(Date.now() - 15 * DAY) } });
    check('14 gün sonra tek taraflı değerlendirme açılır', (await api('GET', `/deals/${deal2}`, B)).json?.deal?.theirReview?.communication === 3);

    console.log('İptal');
    const a3 = await accept(p3.id, null);
    const deal3 = a3.res.json.dealId as string;
    check('termin yoksa anlaşılan tarih boş', (await api('GET', `/deals/${deal3}`, B)).json?.deal?.agreedDeliveryDate === null);
    const can = await api('POST', `/deals/${deal3}/cancel`, S, { reason: 'İplik temin edilemedi' });
    check('satıcı iptal eder; alıcıya bildirim', can.json?.deal?.status === 'iptal' && can.json.deal.cancelledByRole === 'seller' && (await api('GET', '/notifications', B)).json?.notifications?.some((n: any) => n.kind === 'deal_cancelled' && n.data?.dealId === deal3));
    check('iptal edilen işte değerlendirme yok', (await api('POST', `/deals/${deal3}/review`, B, { quality: 1, timing: 1, communication: 1 })).status === 409);
  } finally {
    const userIds = [seller.id, buyer.id, stranger.id];
    await prisma.deal.deleteMany({ where: { buyerId: { in: userIds } } });
    await prisma.quoteRequest.deleteMany({ where: { buyerId: { in: userIds } } });
    await prisma.product.deleteMany({ where: { companyId: sellerCo.id } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.company.deleteMany({ where: { id: { in: [sellerCo.id, buyerCo.id, otherCo.id] } } });
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
