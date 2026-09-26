import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Doğrulanmış iş birliği (Bölüm C): dev.db'nin GEÇİCİ KOPYASI üzerinde, kendi kurduğumuz
// firmalarla (asıl veriye dokunulmaz).
const src = path.join(__dirname, '..', 'prisma', 'dev.db');
const hasDb = fs.existsSync(src);
const tmp = path.join(os.tmpdir(), `takyon-collab-${process.pid}.db`);
if (hasDb) {
  fs.copyFileSync(src, tmp);
  process.env.DATABASE_URL = `file:${tmp.replace(/\\/g, '/')}`;
}

const modP = hasDb ? (async () => ({ ...(await import('./db')), ...(await import('./collaborations')) }))() : null;

after(async () => {
  if (modP) await (await modP).prisma.$disconnect();
  try {
    fs.rmSync(tmp, { force: true });
  } catch {
    /* Windows dosyayı kilitli tutabilir */
  }
});

const tag = `ZZCOL${process.pid}`;
const rnd = () => String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
const userBase = { accountType: 'uretici', position: 'Sahip', firstName: 'Test', lastName: 'Kişi', phoneVerified: true };

type Seed = {
  supplier: string;
  apparel: string;
  third: string;
  supplierUser: string;
  apparelUser: string;
  thirdUser: string;
  noCompanyUser: string;
  productId: string;
  productCode: string;
};
let seeded: Promise<Seed> | null = null;

function seed() {
  seeded ??= (async () => {
    const m = await modP!;
    const mkCompany = async (suffix: string, companyType: string) =>
      (await m.prisma.company.create({ data: { name: `${tag} ${suffix}`, taxId: '', companyType, companyCode: `${tag}${suffix}`.slice(0, 40) } })).id;
    const mkUser = async (companyId: string | null) =>
      (await m.prisma.user.create({ data: { ...userBase, phone: `053${rnd()}`, companyId } })).id;
    const supplier = await mkCompany('Kumas', 'kumas_uretici');
    const apparel = await mkCompany('Atolye', 'fason_atolye');
    const third = await mkCompany('Ucuncu', 'toptanci');
    const productCode = `${tag}-P1`;
    const product = await m.prisma.product.create({
      data: { companyId: supplier, code: productCode, type: 'orme', subtype: 'suprem', stock: 100, weightGsm: 180, widthCm: 160, content: '%100 PAMUK' },
    });
    return {
      supplier,
      apparel,
      third,
      supplierUser: await mkUser(supplier),
      apparelUser: await mkUser(apparel),
      thirdUser: await mkUser(third),
      noCompanyUser: await mkUser(null),
      productId: product.id,
      productCode,
    };
  })();
  return seeded;
}

// Teslim edilmiş numune talebi (olay kaydıyla).
async function deliveredSample(s: Seed, requesterId: string) {
  const m = await modP!;
  return m.prisma.sampleRequest.create({
    data: {
      productId: s.productId,
      requesterId,
      status: 'teslim_edildi',
      events: { create: [{ status: 'talep_edildi', actorId: requesterId }, { status: 'teslim_edildi', actorId: requesterId }] },
    },
  });
}

async function deliveredDeal(s: Seed, buyerCompanyId: string | null, sellerCompanyId = s.supplier) {
  const m = await modP!;
  return m.prisma.deal.create({
    data: {
      quoteRequestId: `${tag}-qr-${rnd()}`,
      quoteId: `${tag}-q`,
      buyerId: s.apparelUser,
      buyerCompanyId,
      sellerCompanyId,
      productId: s.productId,
      productCode: s.productCode,
      quantity: 1500,
      unit: 'kg',
      status: 'teslim_edildi',
      buyerConfirmedAt: new Date('2025-03-05T10:00:00Z'),
    },
  });
}

test('tetikleyici (numune): iki kez teslim tek kayıt; iki firmaya bildirim; yıl teslim yılı', { skip: !hasDb }, async () => {
  const m = await modP!;
  const s = await seed();
  const sr = await deliveredSample(s, s.apparelUser);
  const first = await m.ensureFromSample(sr.id, new Date('2026-02-01T00:00:00Z'));
  const second = await m.ensureFromSample(sr.id, new Date('2026-02-01T00:00:00Z'));
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.collaboration?.id, first.collaboration?.id);
  const c = first.collaboration!;
  assert.equal(c.supplierCompanyId, s.supplier);
  assert.equal(c.apparelCompanyId, s.apparel);
  assert.equal(c.productId, s.productId);
  assert.equal(c.source, 'numune');
  assert.equal(c.year, 2026);
  assert.equal(c.supplierChoice, 'bekliyor');
  assert.equal(m.isPublished(c), false);
  const rows = await m.prisma.collaboration.findMany({ where: { source: 'numune', sourceId: sr.id } });
  assert.equal(rows.length, 1);
  for (const userId of [s.supplierUser, s.apparelUser]) {
    const n = await m.prisma.notification.findMany({ where: { userId, kind: 'collaboration_ask' } });
    assert.equal(n.length, 1);
    assert.equal(JSON.parse(n[0].dataJson).collaborationId, c.id);
    assert.match(n[0].title, /gösterelim mi/);
  }
  // Teslim edilmemiş talep kayıt açmaz.
  const open = await m.prisma.sampleRequest.create({ data: { productId: s.productId, requesterId: s.apparelUser, status: 'hazirlandi' } });
  assert.equal((await m.ensureFromSample(open.id)).collaboration, null);
});

test('tetikleyici (sipariş): teslim edilen sipariş kayıt açar; firması olmayan alıcı ve aynı firma açmaz', { skip: !hasDb }, async () => {
  const m = await modP!;
  const s = await seed();
  const d = await deliveredDeal(s, s.apparel);
  const r1 = await m.ensureFromDeal(d);
  const r2 = await m.ensureFromDeal(d);
  assert.equal(r1.created, true);
  assert.equal(r2.created, false);
  assert.equal(r1.collaboration?.source, 'siparis');
  assert.equal(r1.collaboration?.year, 2025);
  assert.equal((await m.ensureFromDeal(await deliveredDeal(s, null))).collaboration, null);
  assert.equal((await m.ensureFromDeal(await deliveredDeal(s, s.supplier))).collaboration, null);
  // Firması olmayan talep eden: numunede de kayıt yok.
  const sr = await deliveredSample(s, s.noCompanyUser);
  assert.equal((await m.ensureFromSample(sr.id)).collaboration, null);
});

test('onay mantığı: yalnız iki taraf da adli/adsiz seçince yayın; adsız tarafın kimliği sızmaz', { skip: !hasDb }, async () => {
  const m = await modP!;
  const s = await seed();
  const sr = await deliveredSample(s, s.apparelUser);
  const { collaboration: c } = await m.ensureFromSample(sr.id, new Date('2026-05-01T00:00:00Z'));
  const id = c!.id;

  // Tek taraf seçince yayınlanmaz.
  const r1 = await m.setChoice({ collaborationId: id, userId: s.supplierUser, companyId: s.supplier, choice: 'adli' });
  assert.ok(r1.ok);
  assert.equal(m.isPublished(r1.collaboration), false);
  assert.equal((await m.publicForCompany(s.apparel)).some((x) => x.id === id), false);

  // Karşı taraf adsız seçince yayınlanır.
  const r2 = await m.setChoice({ collaborationId: id, userId: s.apparelUser, companyId: s.apparel, choice: 'adsiz' });
  assert.ok(r2.ok);
  assert.equal(m.isPublished(r2.collaboration), true);

  // Tedarikçinin sayfasında: karşı taraf adsız ("Bir konfeksiyon firması"), kimlik yok.
  const onSupplier = (await m.publicForCompany(s.supplier)).find((x) => x.id === id)!;
  assert.ok(onSupplier);
  assert.equal(onSupplier.counterparty.company, null);
  assert.equal(onSupplier.counterparty.anonymousLabel, 'Bir konfeksiyon firması');
  assert.equal(onSupplier.sourceLabel, 'Numune çalışması');
  assert.equal(onSupplier.year, 2026);
  assert.equal(onSupplier.product?.code, s.productCode);
  assert.equal(onSupplier.product?.typeLabel, 'Örme · Süprem');
  const json = JSON.stringify(onSupplier);
  assert.equal(json.includes(s.apparel), false);
  assert.equal(json.includes(`${tag} Atolye`), false);

  // Konfeksiyonun sayfasında: tedarikçi adıyla.
  const onApparel = (await m.publicForCompany(s.apparel)).find((x) => x.id === id)!;
  assert.equal(onApparel.counterparty.company?.id, s.supplier);
  assert.equal(onApparel.counterparty.company?.name, `${tag} Kumas`);
  assert.equal(onApparel.counterparty.anonymousLabel, null);

  // Üründe: alıcı firma kendi seçimine göre (adsız).
  const onProduct = (await m.publicForProduct(s.productId)).find((x) => x.id === id)!;
  assert.equal(onProduct.counterparty.company, null);
  assert.equal(onProduct.counterparty.anonymousLabel, 'Bir konfeksiyon firması');
  assert.equal(await m.publishedCount(s.supplier), await m.publishedCount(s.apparel));

  // Geri alma: iki sayfadan da kalkar; denetim izi "geri_alma".
  const r3 = await m.setChoice({ collaborationId: id, userId: s.apparelUser, companyId: s.apparel, choice: 'gosterme' });
  assert.ok(r3.ok);
  assert.equal(m.isPublished(r3.collaboration), false);
  assert.equal((await m.publicForCompany(s.supplier)).some((x) => x.id === id), false);
  assert.equal((await m.publicForCompany(s.apparel)).some((x) => x.id === id), false);
  assert.equal((await m.publicForProduct(s.productId)).some((x) => x.id === id), false);
  const events = await m.prisma.collaborationEvent.findMany({ where: { collaborationId: id }, orderBy: { createdAt: 'asc' } });
  assert.deepEqual(
    events.map((e) => [e.companyId, e.action, e.fromChoice, e.toChoice]),
    [
      [s.supplier, 'secim', 'bekliyor', 'adli'],
      [s.apparel, 'secim', 'bekliyor', 'adsiz'],
      [s.apparel, 'geri_alma', 'adsiz', 'gosterme'],
    ]
  );

  // Yeniden açma (adli): yayınlanır ve üründe firma adıyla görünür.
  const r4 = await m.setChoice({ collaborationId: id, userId: s.apparelUser, companyId: s.apparel, choice: 'adli' });
  assert.ok(r4.ok);
  assert.equal(m.isPublished(r4.collaboration), true);
  const again = (await m.publicForProduct(s.productId)).find((x) => x.id === id)!;
  assert.equal(again.counterparty.company?.id, s.apparel);

  // Özel liste: taraflar birbirinin gerçek adını görür; seçimler ve yayın durumu.
  const mine = (await m.listMine(s.supplier)).find((x) => x.id === id)!;
  assert.equal(mine.role, 'supplier');
  assert.equal(mine.counterparty?.name, `${tag} Atolye`);
  assert.equal(mine.myChoice, 'adli');
  assert.equal(mine.theirChoice, 'adli');
  assert.equal(mine.published, true);
  assert.equal(mine.pending, false);
});

test('yetki: üçüncü firma, firmasız kullanıcı ve geçersiz seçim reddedilir', { skip: !hasDb }, async () => {
  const m = await modP!;
  const s = await seed();
  const sr = await deliveredSample(s, s.apparelUser);
  const { collaboration: c } = await m.ensureFromSample(sr.id);
  const third = await m.setChoice({ collaborationId: c!.id, userId: s.thirdUser, companyId: s.third, choice: 'adli' });
  assert.deepEqual(third, { ok: false, error: 'not_party' });
  const none = await m.setChoice({ collaborationId: c!.id, userId: s.noCompanyUser, companyId: null, choice: 'adli' });
  assert.deepEqual(none, { ok: false, error: 'not_party' });
  const bad = await m.setChoice({ collaborationId: c!.id, userId: s.supplierUser, companyId: s.supplier, choice: 'bekliyor' });
  assert.deepEqual(bad, { ok: false, error: 'invalid_choice' });
  const missing = await m.setChoice({ collaborationId: 'yok', userId: s.supplierUser, companyId: s.supplier, choice: 'adli' });
  assert.deepEqual(missing, { ok: false, error: 'not_found' });
  assert.equal((await m.prisma.collaborationEvent.count({ where: { collaborationId: c!.id } })), 0);
});

// Gizlilik (madde 15): herkese açık yanıtta miktar, fiyat, sipariş ayrıntısı ve gün YOK.
const PUBLIC_KEYS = {
  root: ['id', 'source', 'sourceLabel', 'year', 'product', 'counterparty'],
  product: ['id', 'code', 'typeLabel'],
  counterparty: ['company', 'anonymousLabel'],
  company: ['id', 'name', 'logoUpdatedAt', 'verification'],
};

test('gizlilik: herkese açık yanıt yalnızca izin verilen alanları taşır (miktar/fiyat/gün yok)', { skip: !hasDb }, async () => {
  const m = await modP!;
  const s = await seed();
  const d = await deliveredDeal(s, s.apparel);
  const { collaboration: c } = await m.ensureFromDeal(d);
  await m.setChoice({ collaborationId: c!.id, userId: s.supplierUser, companyId: s.supplier, choice: 'adli' });
  await m.setChoice({ collaborationId: c!.id, userId: s.apparelUser, companyId: s.apparel, choice: 'adli' });
  const lists = [await m.publicForCompany(s.supplier), await m.publicForCompany(s.apparel), await m.publicForProduct(s.productId)];
  for (const list of lists) {
    const row = list.find((x) => x.id === c!.id)!;
    assert.ok(row);
    assert.deepEqual(Object.keys(row).sort(), [...PUBLIC_KEYS.root].sort());
    assert.deepEqual(Object.keys(row.product!).sort(), [...PUBLIC_KEYS.product].sort());
    assert.deepEqual(Object.keys(row.counterparty).sort(), [...PUBLIC_KEYS.counterparty].sort());
    assert.deepEqual(Object.keys(row.counterparty.company!).sort(), [...PUBLIC_KEYS.company].sort());
    assert.equal(row.sourceLabel, 'Takyon üzerinden doğrulandı');
    const json = JSON.stringify(row).toLowerCase();
    for (const forbidden of ['quantity', 'price', 'unit', 'deliveredat', 'confirmedat', 'createdat', 'sourceid', 'dealid', 'sample', '1500', '2025-03']) {
      assert.equal(json.includes(forbidden), false, `sızan alan: ${forbidden}`);
    }
  }
});

test('geriye dönük doldurma: eksik kayıtlar bildirimsiz açılır, tekrar çalıştırmak bir şey eklemez', { skip: !hasDb }, async () => {
  const m = await modP!;
  const s = await seed();
  const sr = await deliveredSample(s, s.apparelUser);
  const d = await deliveredDeal(s, s.apparel);
  const before = await m.prisma.notification.count({ where: { kind: 'collaboration_ask' } });
  const r1 = await m.backfillCollaborations();
  assert.ok(r1.samples >= 1 && r1.deals >= 1);
  assert.ok(await m.prisma.collaboration.findUnique({ where: { source_sourceId: { source: 'numune', sourceId: sr.id } } }));
  assert.ok(await m.prisma.collaboration.findUnique({ where: { source_sourceId: { source: 'siparis', sourceId: d.id } } }));
  assert.equal(await m.prisma.notification.count({ where: { kind: 'collaboration_ask' } }), before);
  const r2 = await m.backfillCollaborations();
  assert.deepEqual(r2, { samples: 0, deals: 0 });
});
