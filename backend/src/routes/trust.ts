import { Router } from 'express';
import { prisma } from '../db';
import { lateDaysOf, reviewsVisible } from './deals';
import { makeHandle } from './handle';

// Faz 3, Adım 5: güven özeti. Tek bir "sihirli puan" YOK (Fırat kararı 2026-09-18): yalnızca
// bileşenler gösterilir. Verisi az olan firma cezalandırılmaz: eşik altındaki oran ve
// ortalamalar hiç gösterilmez ("henüz yeterli veri yok"). Ödeme ile ilgili hiçbir ölçüt yok.
// Hesap yöntemi açık; hiçbir bileşen ücretle değiştirilemez.
export const trustRouter = Router();
const handle = makeHandle('trust');

export const MIN_DEALS_FOR_RATES = 3;
export const MIN_REVIEWS_FOR_AVERAGE = 3;
export const MIN_REQUESTS_FOR_RESPONSE = 5;
const DAY = 24 * 60 * 60 * 1000;

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (values: number[]) => (values.length ? round1(values.reduce((s, v) => s + v, 0) / values.length) : null);

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function companyTrustSummary(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, verification: true, verificationLevel: true, verifiedAt: true, createdAt: true },
  });
  if (!company) return null;

  const [referenceCount, sellerDeals, buyerDeals, requests] = await Promise.all([
    prisma.companyReference.count({ where: { status: 'confirmed', OR: [{ fromCompanyId: companyId }, { toCompanyId: companyId }] } }),
    prisma.deal.findMany({ where: { sellerCompanyId: companyId, status: 'teslim_edildi' }, include: { reviews: true } }),
    prisma.deal.findMany({ where: { buyerCompanyId: companyId, status: 'teslim_edildi' }, include: { reviews: true } }),
    // Yanıt ölçümü: en az 3 gün önce açılmış istekler (yeni isteğe henüz cevap verilmemiş olması normal).
    prisma.quoteRequest.findMany({
      where: { sellerCompanyId: companyId, createdAt: { lte: new Date(Date.now() - 3 * DAY) }, status: { not: 'cancelled' } },
      select: { createdAt: true, quotes: { where: { sentAt: { not: null } }, orderBy: { sentAt: 'asc' }, take: 1, select: { sentAt: true } } },
      take: 500,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // Satıcı olarak: zamanında teslim ve alıcı değerlendirmeleri (yalnızca GÖRÜNÜR olanlar sayılır).
  const withDates = sellerDeals.filter((d) => lateDaysOf(d) !== null);
  const onTime = withDates.filter((d) => lateDaysOf(d) === 0).length;
  const sellerReviews = sellerDeals.filter(reviewsVisible).flatMap((d) => d.reviews.filter((r) => r.authorRole === 'buyer'));
  const buyerReviews = buyerDeals.filter(reviewsVisible).flatMap((d) => d.reviews.filter((r) => r.authorRole === 'seller'));
  const nums = (values: (number | null)[]) => values.filter((v): v is number => v != null);

  const answered = requests.filter((r) => r.quotes[0]?.sentAt);
  const responseHours = answered.map((r) => (r.quotes[0].sentAt!.getTime() - r.createdAt.getTime()) / (60 * 60 * 1000));
  const medianHours = median(responseHours);

  return {
    company: { id: company.id, name: company.name },
    verification: { status: company.verification, level: company.verification === 'dogrulanmis' ? company.verificationLevel : '', verifiedAt: company.verifiedAt },
    memberSince: company.createdAt,
    confirmedReferenceCount: referenceCount,
    asSeller: {
      completedDeals: sellerDeals.length,
      // Eşik altında oran gösterilmez.
      onTimeRate: withDates.length >= MIN_DEALS_FOR_RATES ? Math.round((100 * onTime) / withDates.length) : null,
      reviewCount: sellerReviews.length,
      ratings:
        sellerReviews.length >= MIN_REVIEWS_FOR_AVERAGE
          ? { quality: avg(nums(sellerReviews.map((r) => r.quality))), timing: avg(nums(sellerReviews.map((r) => r.timing))), communication: avg(sellerReviews.map((r) => r.communication)) }
          : null,
    },
    asBuyer: {
      completedDeals: buyerDeals.length,
      reviewCount: buyerReviews.length,
      ratings:
        buyerReviews.length >= MIN_REVIEWS_FOR_AVERAGE
          ? { communication: avg(buyerReviews.map((r) => r.communication)), seriousness: avg(nums(buyerReviews.map((r) => r.seriousness))) }
          : null,
    },
    quoteResponse:
      requests.length >= MIN_REQUESTS_FOR_RESPONSE
        ? { requestCount: requests.length, responseRate: Math.round((100 * answered.length) / requests.length), medianHours: medianHours == null ? null : round1(medianHours) }
        : null,
    thresholds: { deals: MIN_DEALS_FOR_RATES, reviews: MIN_REVIEWS_FOR_AVERAGE, requests: MIN_REQUESTS_FOR_RESPONSE },
    method:
      'Bileşenler platformdaki kayıtlardan hesaplanır: doğrulama (Takyon), karşılıklı onaylı referanslar, iki tarafın beyan ettiği teslimler, karşılıklı açılan değerlendirmeler ve tekliflere yanıt süresi. Tek bir puan üretilmez; hiçbir bileşen ücretle değiştirilemez. Yeterli veri yoksa oran ve ortalama gösterilmez.',
  };
}

// Herkese açık (firma sayfasındaki "Güven özeti" kartı).
trustRouter.get(
  '/company/:companyId',
  handle(async (req, res) => {
    const summary = await companyTrustSummary(req.params.companyId);
    if (!summary) return res.status(404).json({ error: 'company_not_found' });
    res.json({ trust: summary });
  })
);
