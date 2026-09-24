import { Router } from 'express';
import QRCode from 'qrcode';
import { FINISH_TAGS, SUBTYPES, TYPE_LABELS, type ProductType } from '../catalog';
import { prisma } from '../db';
import { CARE_GROUPS, CARE_SYMBOLS, careSymbolsView, parseCareSymbols } from '../domain/care';
import { certificateLabel, fiberLabel } from '../domain/glossary';
import { optionalAuth } from '../middleware/auth';
import { parseFinishTags } from '../passport';
import { YARN_PRODUCT_TYPE, toYarnSpecRow, YARN_SPEC_SELECT } from '../yarns';
import { makeHandle } from './handle';

// Faz 3, Adım 7: AB Dijital Ürün Pasaportu'na HAZIRLIK. Tekstil için zorunlu alanları belirleyecek
// AB yetkilendirilmiş düzenlemesi henüz yayımlanmadı (2026-09-21'de resmi ESPR sayfasından doğrulandı:
// "ürüne göre, paydaşlarla istişareyle belirlenecek"; sektör kaynaklarına göre 2027, uygulama 2028+).
// Bu yüzden çıktı "uyumlu" DEĞİL, "hazırlık"tır: ESPR'nin genel çerçevesindeki başlıklar
// (benzersiz tanımlayıcı, veri taşıyıcı/QR, ekonomik işletmeci, içerik, menşe, belgeler, bakım).
// Fiyat, stok, MOQ, termin gibi TİCARİ alanlar ASLA dışa çıkmaz.
export const dppRouter = Router();
const handle = makeHandle('dpp');

export const DPP_SCHEMA = 'avedon-dpp-hazirlik/1';

export const publicBase = () => (process.env.PUBLIC_WEB_URL ?? 'https://avedon-blond.vercel.app').replace(/\/+$/, '');
export const passportUrl = (productId: string) => `${publicBase()}/pasaport.html?id=${encodeURIComponent(productId)}`;

const SELECT = {
  id: true,
  code: true,
  type: true,
  subtype: true,
  weightGsm: true,
  widthCm: true,
  content: true,
  finishTags: true,
  originCountry: true,
  careNotes: true,
  careSymbols: true,
  recycledPercent: true,
  passportUpdatedAt: true,
  createdAt: true,
  companyId: true,
  company: { select: { id: true, name: true, city: true, website: true, verification: true, verificationLevel: true } },
  compositions: { select: { fiber: true, percent: true }, orderBy: { position: 'asc' as const } },
  yarns: { select: { role: true, count: true, unit: true, ply: true, yarnType: true }, orderBy: { position: 'asc' as const } },
  certificates: { select: { name: true, number: true, validUntil: true }, orderBy: { position: 'asc' as const } },
  testReports: { select: { kind: true, result: true, testedAt: true }, orderBy: { position: 'asc' as const } },
  yarnSpec: { select: YARN_SPEC_SELECT },
  _count: { select: { images: true } },
};

async function load(id: string) {
  return prisma.product.findUnique({ where: { id }, select: SELECT });
}
type Row = NonNullable<Awaited<ReturnType<typeof load>>>;

// Satıcıya gösterilen eksik listesi: önem sırasıyla.
export function readiness(p: Row) {
  const isYarn = p.type === YARN_PRODUCT_TYPE;
  const origin = p.originCountry || p.yarnSpec?.origin || '';
  const items = [
    { key: 'composition', label: 'Lif içeriği (yüzdeleriyle)', done: p.compositions.length > 0, weight: 25 },
    { key: 'origin', label: 'Menşe ülke', done: !!origin, weight: 20 },
    { key: 'certificates', label: 'Sertifika (numarasıyla)', done: p.certificates.some((c) => !!c.number), weight: 15 },
    { key: 'care', label: 'Bakım sembolleri', done: parseCareSymbols(p.careSymbols).length > 0 || !!p.careNotes, weight: 10 },
    { key: 'recycled', label: 'Geri dönüştürülmüş içerik oranı (yoksa 0)', done: p.recycledPercent != null, weight: 10 },
    { key: 'photo', label: 'Ürün fotoğrafı', done: p._count.images > 0, weight: 5 },
    { key: 'company', label: 'Firma doğrulaması', done: p.company.verification === 'dogrulanmis', weight: 5 },
    ...(isYarn ? [] : [{ key: 'testReports', label: 'Test raporu', done: p.testReports.length > 0, weight: 5 }, { key: 'yarns', label: 'İplik bilgisi', done: p.yarns.length > 0, weight: 5 }]),
  ];
  const total = items.reduce((s, i) => s + i.weight, 0);
  const done = items.filter((i) => i.done).reduce((s, i) => s + i.weight, 0);
  return { percent: Math.round((100 * done) / total), missing: items.filter((i) => !i.done).map(({ key, label }) => ({ key, label })) };
}

function subtypeLabelOf(type: string, subtype: string) {
  return (SUBTYPES[type as ProductType] ?? []).find((s) => s.key === subtype)?.label ?? '';
}

function toDocument(p: Row) {
  const isYarn = p.type === YARN_PRODUCT_TYPE;
  const yarn = toYarnSpecRow(p.yarnSpec);
  return {
    schema: DPP_SCHEMA,
    disclaimer:
      'AB Dijital Ürün Pasaportu (ESPR) için tekstile özel zorunlu alanlar henüz yayımlanmamıştır. Bu belge bir HAZIRLIK çıktısıdır; yasal uyum beyanı değildir. Bilgiler satıcı firmanın beyanıdır.',
    identifier: { productId: p.id, code: p.code, url: passportUrl(p.id) },
    issuedAt: new Date().toISOString(),
    updatedAt: (p.passportUpdatedAt ?? p.createdAt).toISOString(),
    economicOperator: {
      name: p.company.name,
      city: p.company.city,
      website: p.company.website,
      verified: p.company.verification === 'dogrulanmis',
      verificationLevel: p.company.verification === 'dogrulanmis' ? p.company.verificationLevel : '',
    },
    product: {
      category: isYarn ? 'İplik' : 'Kumaş',
      type: isYarn ? 'İplik' : (TYPE_LABELS[p.type as ProductType] ?? p.type),
      subtype: isYarn ? (yarn?.summary ?? '') : subtypeLabelOf(p.type, p.subtype),
      weightGsm: isYarn ? null : p.weightGsm,
      widthCm: isYarn ? null : p.widthCm,
      description: p.content,
      hasPhoto: p._count.images > 0,
    },
    composition: p.compositions.map((c) => ({ fiber: c.fiber, fiberLabel: fiberLabel(c.fiber), percent: c.percent })),
    recycledContentPercent: p.recycledPercent,
    originCountry: p.originCountry || p.yarnSpec?.origin || '',
    yarns: p.yarns.map((y) => ({ role: y.role, count: y.count, unit: y.unit, ply: y.ply, type: y.yarnType })),
    finishes: parseFinishTags(p.finishTags).map((k) => FINISH_TAGS.find((t) => t.key === k)?.label ?? k),
    certificates: p.certificates.map((c) => ({ name: c.name, label: certificateLabel(c.name), number: c.number, validUntil: c.validUntil })),
    testReports: p.testReports.map((t) => ({ kind: t.kind, result: t.result, testedAt: t.testedAt })),
    care: p.careNotes,
    careSymbols: careSymbolsView(parseCareSymbols(p.careSymbols)),
  };
}

// Bakım sembolleri kataloğu (çizim tarifleriyle); form ve pasaport sayfası bunu kullanır.
// '/:productId' rotasından ÖNCE tanımlı olmalı.
dppRouter.get('/care-symbols', (_req, res) => {
  res.json({ groups: CARE_GROUPS, symbols: CARE_SYMBOLS });
});

// Herkese açık pasaport verisi (QR sayfası ve JSON indirme bunu okur). Sahibi ayrıca eksik listesini alır.
dppRouter.get(
  '/:productId',
  optionalAuth,
  handle(async (req, res) => {
    const p = await load(req.params.productId);
    if (!p) return res.status(404).json({ error: 'product_not_found' });
    const isOwner = !!req.user?.companyId && req.user.companyId === p.companyId;
    const r = readiness(p);
    res.json({ passport: toDocument(p), completenessPercent: r.percent, ...(isOwner ? { missing: r.missing } : {}) });
  })
);

// Etikete / kartelaya basılacak QR (PNG). İçerik yalnızca herkese açık pasaport adresidir.
dppRouter.get(
  '/:productId/qr.png',
  handle(async (req, res) => {
    const exists = await prisma.product.findUnique({ where: { id: req.params.productId }, select: { id: true } });
    if (!exists) return res.status(404).json({ error: 'product_not_found' });
    const size = Math.min(1200, Math.max(200, Number(req.query.size) || 600));
    const png = await QRCode.toBuffer(passportUrl(exists.id), { type: 'png', width: size, margin: 2, errorCorrectionLevel: 'M' });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(png);
  })
);
