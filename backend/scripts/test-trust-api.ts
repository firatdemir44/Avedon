// Güven özeti (Faz 3, Adım 5) uçtan uca API testi. Veriyi doğrudan veritabanına kurar:
//   node --env-file=.env --import tsx scripts/test-trust-api.ts
import { PrismaClient } from '@prisma/client';

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
    console.log(`  HATA ${name}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 700));
  }
}

const get = async (path: string) => {
  const res = await fetch(BASE + path);
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};

async function main() {
  const suffix = Date.now().toString().slice(-6);
  const seller = await prisma.company.create({ data: { name: `Güven Satıcı ${suffix}`, taxId: `21${suffix}`, companyCode: `GV-${suffix}`, verification: 'dogrulanmis', verificationLevel: 'ziyaret', verifiedAt: new Date() } });
  const buyerCo = await prisma.company.create({ data: { name: `Güven Alıcı ${suffix}`, taxId: `22${suffix}`, companyCode: `GB-${suffix}` } });
  const fresh = await prisma.company.create({ data: { name: `Güven Yeni ${suffix}`, taxId: `23${suffix}`, companyCode: `GY-${suffix}` } });
  const buyer = await prisma.user.create({ data: { accountType: 'uretici', position: 'Test', firstName: 'Test', lastName: 'Alıcı', phone: `0511${suffix}`, phoneVerified: true, companyId: buyerCo.id } });
  const product = await prisma.product.create({ data: { companyId: seller.id, code: `GV-${suffix}`, type: 'orme', stock: 1, stockUnit: 'kg', weightGsm: 200, widthCm: 160, content: 'x' } });
  let n = 0;
  const mkDeal = async (opts: { lateDays: number; confirmedDaysAgo: number; buyerReview?: [number, number, number]; sellerReview?: [number, number]; status?: string }) => {
    n++;
    const agreed = new Date(Date.now() - 30 * DAY);
    const deal = await prisma.deal.create({
      data: {
        quoteRequestId: `test-${suffix}-${n}`, quoteId: 'q', buyerId: buyer.id, buyerCompanyId: buyerCo.id, sellerCompanyId: seller.id, productId: product.id, productCode: product.code,
        quantity: 100, unit: 'kg', agreedDeliveryDate: agreed, status: opts.status ?? 'teslim_edildi',
        sellerDeliveredAt: new Date(agreed.getTime() + opts.lateDays * DAY + 1000), buyerConfirmedAt: new Date(Date.now() - opts.confirmedDaysAgo * DAY),
      },
    });
    if (opts.buyerReview) await prisma.dealReview.create({ data: { dealId: deal.id, authorRole: 'buyer', authorUserId: buyer.id, targetCompanyId: seller.id, quality: opts.buyerReview[0], timing: opts.buyerReview[1], communication: opts.buyerReview[2] } });
    if (opts.sellerReview) await prisma.dealReview.create({ data: { dealId: deal.id, authorRole: 'seller', authorUserId: buyer.id, targetCompanyId: buyerCo.id, communication: opts.sellerReview[0], seriousness: opts.sellerReview[1] } });
    return deal;
  };

  try {
    console.log('Yeni firma cezalandırılmaz');
    const empty = await get(`/trust/company/${fresh.id}`);
    check('oturumsuz okunur; oran ve ortalamalar yok', empty.status === 200 && empty.json?.trust?.asSeller?.onTimeRate === null && empty.json.trust.asSeller.ratings === null && empty.json.trust.quoteResponse === null && empty.json.trust.asSeller.completedDeals === 0, empty.json);
    check('tek puan alanı yok', !('score' in (empty.json?.trust ?? {})) && typeof empty.json?.trust?.method === 'string');
    check('ödeme ile ilgili alan yok', !/payment|odeme|ödeme zaman/i.test(JSON.stringify(empty.json).replace(empty.json.trust.method, '')));
    check('olmayan firma 404', (await get('/trust/company/yok')).status === 404);

    console.log('Eşik altı gizli');
    await mkDeal({ lateDays: 0, confirmedDaysAgo: 1, buyerReview: [5, 5, 5], sellerReview: [5, 5] });
    await mkDeal({ lateDays: 3, confirmedDaysAgo: 1, buyerReview: [3, 2, 4], sellerReview: [4, 4] });
    const two = await get(`/trust/company/${seller.id}`);
    check('2 işte sayı görünür ama oran ve ortalama görünmez', two.json?.trust?.asSeller?.completedDeals === 2 && two.json.trust.asSeller.onTimeRate === null && two.json.trust.asSeller.ratings === null, two.json?.trust?.asSeller);

    console.log('Eşik üstü');
    await mkDeal({ lateDays: 0, confirmedDaysAgo: 1, buyerReview: [4, 5, 5], sellerReview: [5, 3] });
    // Tek taraflı ve 14 günü dolmamış değerlendirme: henüz görünür değil, sayılmamalı.
    await mkDeal({ lateDays: 0, confirmedDaysAgo: 2, buyerReview: [1, 1, 1] });
    // Tek taraflı ama 14 günü dolmuş: sayılır.
    await mkDeal({ lateDays: 0, confirmedDaysAgo: 20, buyerReview: [4, 4, 4] });
    // İptal edilen iş hiçbir yere sayılmaz.
    await mkDeal({ lateDays: 9, confirmedDaysAgo: 1, status: 'iptal' });
    const full = await get(`/trust/company/${seller.id}`);
    const s = full.json?.trust?.asSeller;
    check('5 tamamlanan iş; zamanında teslim %80 (4/5)', s?.completedDeals === 5 && s.onTimeRate === 80, s);
    check('görünmeyen (tek taraflı, 14 gün dolmamış) kötü puan ortalamaya girmez: 4 değerlendirme', s?.reviewCount === 4 && s.ratings?.quality === 4 && s.ratings.timing === 4 && s.ratings.communication === 4.5, s);
    const b = (await get(`/trust/company/${buyerCo.id}`)).json?.trust?.asBuyer;
    check('alıcı firma: satıcıların değerlendirmesi (iletişim, ciddiyet)', b?.completedDeals === 5 && b.reviewCount === 3 && b.ratings?.communication === 4.7 && b.ratings.seriousness === 4, b);
    check('doğrulama düzeyi ve üyelik tarihi', full.json?.trust?.verification?.level === 'ziyaret' && !!full.json.trust.memberSince);

    console.log('Teklife yanıt süresi');
    const mkReq = async (daysAgo: number, answeredAfterHours: number | null) => {
      const createdAt = new Date(Date.now() - daysAgo * DAY);
      const r = await prisma.quoteRequest.create({ data: { buyerId: buyer.id, buyerCompanyId: buyerCo.id, sellerCompanyId: seller.id, productId: product.id, quantity: 1, unit: 'kg', createdAt, status: answeredAfterHours == null ? 'open' : 'quoted' } });
      if (answeredAfterHours != null) await prisma.quote.create({ data: { requestId: r.id, sellerUserId: buyer.id, status: 'sent', priceValue: 1, priceCurrency: 'USD', priceUnit: 'kg', sentAt: new Date(createdAt.getTime() + answeredAfterHours * 60 * 60 * 1000) } });
    };
    await mkReq(10, 2);
    await mkReq(9, 6);
    await mkReq(8, 30);
    await mkReq(7, null);
    check('4 istekle yanıt bilgisi gizli (eşik 5)', (await get(`/trust/company/${seller.id}`)).json?.trust?.quoteResponse === null);
    await mkReq(6, 4);
    await mkReq(1, null); // 3 günden yeni: ölçüme girmez
    const q = (await get(`/trust/company/${seller.id}`)).json?.trust?.quoteResponse;
    check('5 istek: yanıt oranı %80, ortanca 5 saat; yeni istek sayılmaz', q?.requestCount === 5 && q.responseRate === 80 && q.medianHours === 5, q);
  } finally {
    await prisma.deal.deleteMany({ where: { buyerId: buyer.id } });
    await prisma.quoteRequest.deleteMany({ where: { buyerId: buyer.id } });
    await prisma.product.deleteMany({ where: { companyId: seller.id } });
    await prisma.user.deleteMany({ where: { id: buyer.id } });
    await prisma.company.deleteMany({ where: { id: { in: [seller.id, buyerCo.id, fresh.id] } } });
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
