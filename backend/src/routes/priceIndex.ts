import { Router } from 'express';
import { SUBTYPES, TYPE_LABELS, type ProductType } from '../catalog';
import { prisma } from '../db';
import { effectiveWidthCm } from '../domain/calc/wastage';
import { fiberLabel } from '../domain/glossary';
import { requireAuth } from '../middleware/auth';
import { YARN_PRODUCT_TYPE } from '../yarns';
import { makeHandle } from './handle';

// Faz 3, Adım 6: anonim fiyat / termin endeksi. Kaynak GÖNDERİLMİŞ tekliflerdir (liste fiyatı değil).
// Teklifler kendiliğinden dahildir (Fırat kararı 2026-09-18); karşılığında anonimlik sıkıdır:
//  - bir kümede aynı para biriminde en az MIN_SELLERS farklı satıcı ve MIN_QUOTES teklif yoksa HİÇBİR ŞEY dönmez,
//  - yalnızca çeyrekler ve ortanca döner; tek tek teklif, firma adı, en düşük/en yüksek değer ASLA dönmez.
export const priceIndexRouter = Router();
priceIndexRouter.use(requireAuth);
const handle = makeHandle('price-index');

export const MIN_SELLERS = 5;
export const MIN_QUOTES = 8;
export const WINDOW_DAYS = 90;
const GSM_BAND = 20;
const DAY = 24 * 60 * 60 * 1000;

function quantile(sorted: number[], q: number) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
const round2 = (n: number) => Math.round(n * 100) / 100;

const mainFiberOf = (rows: { fiber: string; percent: number }[]) => [...rows].sort((a, b) => b.percent - a.percent)[0]?.fiber ?? '';

// Kumaşta fiyat kg'a çevrilir (gramaj × hesap eni); çevrilemeyen teklif kümeye girmez.
function pricePerKg(value: number, unit: string, gsm: number, widthCm: number): number | null {
  if (unit === 'kg') return value;
  const kgPerMeter = (gsm * (widthCm / 100)) / 1000;
  return unit === 'm' && kgPerMeter > 0 ? value / kgPerMeter : null;
}

priceIndexRouter.get(
  '/product/:productId',
  handle(async (req, res) => {
    const base = await prisma.product.findUnique({
      where: { id: req.params.productId },
      select: { id: true, type: true, subtype: true, weightGsm: true, companyId: true, compositions: { select: { fiber: true, percent: true } }, yarnSpec: { select: { family: true, countDtex: true } } },
    });
    if (!base) return res.status(404).json({ error: 'product_not_found' });

    const isYarn = base.type === YARN_PRODUCT_TYPE;
    const baseFiber = mainFiberOf(base.compositions);
    const gsmLow = Math.floor(base.weightGsm / GSM_BAND) * GSM_BAND;
    const cluster = isYarn
      ? { label: 'İplik', parts: [base.yarnSpec?.family ?? ''] }
      : {
          label: [TYPE_LABELS[base.type as ProductType] ?? base.type, (SUBTYPES[base.type as ProductType] ?? []).find((s) => s.key === base.subtype)?.label, baseFiber ? `ana lif ${fiberLabel(baseFiber)}` : '', `${gsmLow}-${gsmLow + GSM_BAND} gr/m²`]
            .filter(Boolean)
            .join(' · '),
        };

    const quotes = await prisma.quote.findMany({
      where: {
        sentAt: { gte: new Date(Date.now() - WINDOW_DAYS * DAY) },
        status: { in: ['sent', 'accepted', 'declined', 'superseded'] },
        priceValue: { not: null },
        request: {
          product: isYarn
            ? { type: YARN_PRODUCT_TYPE, yarnSpec: { family: base.yarnSpec?.family ?? '__yok__', countDtex: { gte: (base.yarnSpec?.countDtex ?? 0) * 0.9, lte: (base.yarnSpec?.countDtex ?? 0) * 1.1 } } }
            : { type: base.type, subtype: base.subtype, weightGsm: { gte: gsmLow, lt: gsmLow + GSM_BAND } },
        },
      },
      orderBy: { sentAt: 'desc' },
      take: 2000,
      select: {
        requestId: true,
        priceValue: true,
        priceCurrency: true,
        priceUnit: true,
        leadTimeDays: true,
        request: { select: { sellerCompanyId: true, product: { select: { weightGsm: true, widthCm: true, widthMeaning: true, compositions: { select: { fiber: true, percent: true } } } } } },
      },
    });

    // İstek başına yalnızca EN SON gönderilen teklif (revizyonlar aynı pazarlığın parçası).
    const seen = new Set<string>();
    const rows = quotes
      .filter((q) => !seen.has(q.requestId) && seen.add(q.requestId))
      .filter((q) => isYarn || !baseFiber || mainFiberOf(q.request.product.compositions) === baseFiber)
      .map((q) => {
        const p = q.request.product;
        const width = effectiveWidthCm(p.widthCm, p.widthMeaning === 'tup_tek_yuz' ? 'tup_tek_yuz' : 'acik');
        return { sellerCompanyId: q.request.sellerCompanyId, currency: q.priceCurrency, perKg: pricePerKg(q.priceValue!, q.priceUnit, p.weightGsm, width), leadTimeDays: q.leadTimeDays };
      })
      .filter((r): r is typeof r & { perKg: number } => r.perKg != null && !!r.currency);

    const byCurrency = [...new Set(rows.map((r) => r.currency))]
      .map((currency) => {
        const group = rows.filter((r) => r.currency === currency);
        const sellers = new Set(group.map((r) => r.sellerCompanyId));
        if (sellers.size < MIN_SELLERS || group.length < MIN_QUOTES) return null;
        const prices = group.map((r) => r.perKg).sort((a, b) => a - b);
        const leads = group.map((r) => r.leadTimeDays).filter((v): v is number => v != null).sort((a, b) => a - b);
        // Kendi teklifi olan satıcıya, ortancasının banda göre yeri (kendi verisi; başkasına dönmez).
        const mine = req.user!.companyId ? group.filter((r) => r.sellerCompanyId === req.user!.companyId).map((r) => r.perKg).sort((a, b) => a - b) : [];
        const p25 = quantile(prices, 0.25);
        const p75 = quantile(prices, 0.75);
        const myMedian = mine.length ? quantile(mine, 0.5) : null;
        return {
          currency,
          unit: 'kg',
          price: { p25: round2(p25), median: round2(quantile(prices, 0.5)), p75: round2(p75) },
          leadTimeDays: leads.length >= MIN_QUOTES ? { p25: Math.round(quantile(leads, 0.25)), median: Math.round(quantile(leads, 0.5)), p75: Math.round(quantile(leads, 0.75)) } : null,
          // Tam sayı yerine kaba büyüklük: küçük kümelerde kimin teklif verdiği çıkarsanmasın.
          sampleSize: group.length >= 50 ? '50+' : group.length >= 20 ? '20+' : `${MIN_QUOTES}+`,
          myPosition: myMedian == null ? null : myMedian < p25 ? 'below' : myMedian > p75 ? 'above' : 'within',
        };
      })
      .filter((x) => x !== null);

    res.json({
      cluster: { label: cluster.label, windowDays: WINDOW_DAYS },
      available: byCurrency.length > 0,
      bands: byCurrency,
      rules: { minSellers: MIN_SELLERS, minQuotes: MIN_QUOTES },
      note: 'Son 90 günde gönderilmiş tekliflerden hesaplanır; teklifler anonimdir. Bir kümede en az 5 farklı satıcıdan 8 teklif yoksa hiçbir değer gösterilmez. Fiyatlar kg başına çevrilmiştir; para birimi çevrilmez.',
    });
  })
);
