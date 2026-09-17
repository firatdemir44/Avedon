// Teklif akışı (Faz 2, Adım 2) uçtan uca API testi. Çalışan yerel sunucuya karşı:
//   node --env-file=.env --import tsx scripts/test-quotes-api.ts
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
    console.log(`  HATA ${name}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 400));
  }
}

async function api(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
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
  const sellerCo = await prisma.company.create({ data: { name: `Teklif Satıcı ${suffix}`, taxId: `95${suffix}`, companyCode: `QS-${suffix}` } });
  const otherCo = await prisma.company.create({ data: { name: `Teklif Yabancı ${suffix}`, taxId: `96${suffix}`, companyCode: `QY-${suffix}` } });
  const mk = (phone: string, companyId: string | null) =>
    prisma.user.create({ data: { accountType: 'uretici', position: 'Test', firstName: 'Test', lastName: phone, phone, phoneVerified: true, companyId } });
  const seller = await mk(`0595${suffix}`, sellerCo.id);
  const stranger = await mk(`0596${suffix}`, otherCo.id);
  const buyer = await mk(`0597${suffix}`, null);
  const [S, X, B] = [seller, stranger, buyer].map((u) => signSessionToken(u.id));

  const priced = await prisma.product.create({
    data: { companyId: sellerCo.id, code: `Q-${suffix}-1`, type: 'orme', subtype: 'suprem', stock: 1000, stockUnit: 'kg', weightGsm: 200, widthCm: 160, content: '%100 Pamuk', priceValue: 8, priceCurrency: 'USD', priceUnit: 'kg', moq: 300, moqUnit: 'm', leadTimeDays: 12 },
  });
  const unpriced = await prisma.product.create({
    data: { companyId: sellerCo.id, code: `Q-${suffix}-2`, type: 'orme', subtype: 'suprem', stock: 1000, stockUnit: 'kg', weightGsm: 180, widthCm: 180, content: '%100 Pamuk' },
  });

  try {
    console.log('İstek açma (bağlantı şartı yok)');
    check('oturumsuz 401', (await api('POST', '/quotes/requests', undefined, {})).status === 401);
    check('geçersiz gövde 400', (await api('POST', '/quotes/requests', B, { productId: priced.id, quantity: -1, unit: 'm' })).status === 400);
    check('kendi ürünü 400', (await api('POST', '/quotes/requests', S, { productId: priced.id, quantity: 100, unit: 'm' })).json?.error === 'own_product');
    check('olmayan ürün 404', (await api('POST', '/quotes/requests', B, { productId: 'yok', quantity: 100, unit: 'm' })).status === 404);
    const r1 = await api('POST', '/quotes/requests', B, { productId: priced.id, quantity: 200, unit: 'm', targetDate: '2026-11-01', note: 'Koyu lacivert' });
    check('bağlantısız alıcı 201', r1.status === 201 && r1.json?.request?.status === 'open' && r1.json.request.role === 'buyer', r1.json);
    const id = r1.json.request.id;
    check('aynı ürüne ikinci açık istek 409', (await api('POST', '/quotes/requests', B, { productId: priced.id, quantity: 50, unit: 'm' })).status === 409);
    check('satıcıya bildirim', (await api('GET', '/notifications', S)).json?.notifications?.some((n: any) => n.kind === 'quote_request_new' && n.data?.quoteRequestId === id));

    console.log('Görünürlük');
    check('üçüncü taraf 404', (await api('GET', `/quotes/requests/${id}`, X)).status === 404);
    check('satıcı listesinde', (await api('GET', '/quotes/requests?role=seller', S)).json?.requests?.some((r: any) => r.id === id && r.role === 'seller'));
    check('alıcı listesinde', (await api('GET', '/quotes/requests', B)).json?.requests?.some((r: any) => r.id === id));
    check('yabancının satıcı listesi boş', (await api('GET', '/quotes/requests?role=seller', X)).json?.requests?.length === 0);

    console.log('Taslak (ürün kaydından, fiyat uydurulmaz)');
    check('alıcı taslak isteyemez 404', (await api('POST', `/quotes/requests/${id}/draft`, B)).status === 404);
    const d1 = await api('POST', `/quotes/requests/${id}/draft`, S);
    const draft = d1.json?.request?.draft;
    check('taslak: 8 USD/kg → 2,56 USD/m', d1.status === 200 && Math.abs((draft?.price?.value ?? 0) - 2.56) < 0.001 && draft?.price?.currency === 'USD' && draft?.price?.unit === 'm', d1.json);
    check('taslak bilgisi: çevrildi, MOQ altında, toplam 512', d1.json?.draftInfo?.converted === true && d1.json?.draftInfo?.belowMoq === true && Math.abs(d1.json?.draftInfo?.total - 512) < 0.01, d1.json?.draftInfo);
    check('termin ve MOQ ürün kaydından', draft?.leadTimeDays === 12 && draft?.moq === 300, draft);
    check('alıcı taslağı GÖRMEZ', (await api('GET', `/quotes/requests/${id}`, B)).json?.request?.quotes?.length === 0);

    const r2 = await api('POST', '/quotes/requests', B, { productId: unpriced.id, quantity: 500, unit: 'kg' });
    const d2 = await api('POST', `/quotes/requests/${r2.json.request.id}/draft`, S);
    check('fiyatsız üründe fiyat boş ve eksik bildirilir', d2.json?.request?.draft?.price === null && d2.json?.draftInfo?.missing?.includes('fiyat'), d2.json);
    check('fiyatsız taslak gönderilemez 400 price_required', (await api('POST', `/quotes/requests/${r2.json.request.id}/quote/send`, S)).json?.error === 'price_required');

    console.log('Düzenleme ve gönderim');
    const put = await api('PUT', `/quotes/requests/${id}/quote`, S, { priceValue: 2.5, priceCurrency: 'USD', priceUnit: 'm', paymentTerms: '%50 peşin, kalan sevkte', note: 'Renk onayı sonrası 12 gün' });
    check('satıcı taslağı düzeltir', put.json?.request?.draft?.price?.value === 2.5 && put.json.request.draft.paymentTerms.includes('peşin'), put.json);
    check('yabancı gönderemez 404', (await api('POST', `/quotes/requests/${id}/quote/send`, X)).status === 404);
    const sent = await api('POST', `/quotes/requests/${id}/quote/send`, S);
    check('gönderildi → quoted', sent.json?.request?.status === 'quoted' && sent.json.request.activeQuote?.status === 'sent', sent.json);
    check('alıcıya bildirim', (await api('GET', '/notifications', B)).json?.notifications?.some((n: any) => n.kind === 'quote_received' && n.data?.quoteRequestId === id));
    const seen = await api('GET', `/quotes/requests/${id}`, B);
    check('alıcı teklifi fiyatıyla görür', seen.json?.request?.activeQuote?.price?.value === 2.5, seen.json?.request?.activeQuote);
    check('fiyat ürün listesine sızmaz', !JSON.stringify((await api('GET', `/products/${priced.id}`, B)).json).includes('"price"'));

    console.log('Revizyon ve yanıt');
    check('bağlantı yokken teklif sohbete düşmez', (await prisma.message.count({ where: { quoteRequestId: id } })) === 0);
    await prisma.connection.create({ data: { requesterId: buyer.id, addresseeId: seller.id, status: 'accepted', respondedAt: new Date() } });
    await api('PUT', `/quotes/requests/${id}/quote`, S, { priceValue: 2.4, priceCurrency: 'USD', priceUnit: 'm' });
    const resent = await api('POST', `/quotes/requests/${id}/quote/send`, S);
    const statuses = resent.json?.request?.quotes?.map((q: any) => q.status);
    const convs = await api('GET', '/conversations', B);
    const convId = convs.json?.conversations?.[0]?.id;
    const chat = await api('GET', `/conversations/${convId}/messages`, B);
    const card = chat.json?.messages?.find((m: any) => m.quoteRequestId === id);
    check('bağlantılıyken teklif sohbete kart olarak düşer', !!card && card.senderId === seller.id && card.body.includes('2,4 USD/m'), chat.json);
    check('yeni sürüm gönderilince eskisi superseded', resent.json?.request?.activeQuote?.price?.value === 2.4 && statuses?.includes('superseded'), statuses);
    check('satıcı yanıt veremez 404', (await api('POST', `/quotes/requests/${id}/respond`, S, { action: 'accept' })).status === 404);
    const acc = await api('POST', `/quotes/requests/${id}/respond`, B, { action: 'accept' });
    check('alıcı kabul eder', acc.json?.request?.status === 'accepted' && acc.json.request.activeQuote?.status === 'accepted', acc.json);
    check('satıcıya kabul bildirimi', (await api('GET', '/notifications', S)).json?.notifications?.some((n: any) => n.kind === 'quote_accepted'));
    check('kapanmış isteğe taslak 409', (await api('POST', `/quotes/requests/${id}/draft`, S)).status === 409);
    check('ikinci kez yanıt 409', (await api('POST', `/quotes/requests/${id}/respond`, B, { action: 'decline' })).status === 409);

    console.log('Geri çekme ve süre');
    check('alıcı açık isteği geri çeker', (await api('POST', `/quotes/requests/${r2.json.request.id}/cancel`, B)).json?.request?.status === 'cancelled');
    const r3 = await api('POST', '/quotes/requests', B, { productId: unpriced.id, quantity: 100, unit: 'kg' });
    await api('PUT', `/quotes/requests/${r3.json.request.id}/quote`, S, { priceValue: 5, priceCurrency: 'USD', priceUnit: 'kg', validUntil: '2020-01-01' });
    await api('POST', `/quotes/requests/${r3.json.request.id}/quote/send`, S);
    const exp = await api('GET', `/quotes/requests/${r3.json.request.id}`, B);
    check('süresi geçmiş teklif expired görünür', exp.json?.request?.quotes?.[0]?.status === 'expired', exp.json?.request?.quotes);
    check('süresi geçmiş teklif kabul edilemez 409', (await api('POST', `/quotes/requests/${r3.json.request.id}/respond`, B, { action: 'accept' })).json?.error === 'quote_expired');
  } finally {
    const userIds = [seller.id, stranger.id, buyer.id];
    await prisma.message.deleteMany({ where: { senderId: { in: userIds } } });
    await prisma.conversation.deleteMany({ where: { OR: [{ userAId: { in: userIds } }, { userBId: { in: userIds } }] } });
    await prisma.connection.deleteMany({ where: { OR: [{ requesterId: { in: userIds } }, { addresseeId: { in: userIds } }] } });
    await prisma.quoteRequest.deleteMany({ where: { buyerId: { in: userIds } } });
    await prisma.product.deleteMany({ where: { companyId: sellerCo.id } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.company.deleteMany({ where: { id: { in: [sellerCo.id, otherCo.id] } } });
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
