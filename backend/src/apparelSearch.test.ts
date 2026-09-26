import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkApparelRequest, MAX_APPAREL_IMAGES } from './apparelRequests';

// Konfeksiyon araması: dev.db'nin GEÇİCİ KOPYASI üzerinde, kendi kurduğumuz firmalarla
// (asıl veriye dokunulmaz). Sonuçlar yalnızca bu testin firmalarına (ad öneki) bakılarak doğrulanır.
const src = path.join(__dirname, '..', 'prisma', 'dev.db');
const hasDb = fs.existsSync(src);
const tmp = path.join(os.tmpdir(), `takyon-apparel-${process.pid}.db`);
if (hasDb) {
  fs.copyFileSync(src, tmp);
  process.env.DATABASE_URL = `file:${tmp.replace(/\\/g, '/')}`;
}

const modP = hasDb ? (async () => ({ ...(await import('./db')), ...(await import('./apparelSearch')) }))() : null;

after(async () => {
  if (modP) await (await modP).prisma.$disconnect();
  try {
    fs.rmSync(tmp, { force: true });
  } catch {
    /* Windows dosyayı kilitli tutabilir */
  }
});

const tag = `ZZAPP${process.pid}`;
let seeded: Promise<Record<string, string>> | null = null;

// Beş firma: ranking ve süzgeçleri ayrıştıracak şekilde.
function seed() {
  seeded ??= (async () => {
    const m = await modP!;
    const mk = async (suffix: string, companyType: string, city: string, verification: string, production: Record<string, unknown>) => {
      const c = await m.prisma.company.create({
        data: { name: `${tag} ${suffix}`, taxId: '', companyType, city, verification, companyCode: `${tag}${suffix}`.slice(0, 40) },
      });
      await m.prisma.companyProduction.create({ data: { companyId: c.id, ...production } });
      return c.id;
    };
    const j = JSON.stringify;
    return {
      // Tayt ana uzmanlık, doğrulanmamış, büyük kapasite.
      A: await mk('A', 'fason_atolye', 'Bursa', 'dogrulanmamis', { productGroups: j(['tayt', 'mayo']), mainGroups: j(['tayt']), monthlyCapacity: 80000, moqPerModel: 500, productionLeadDays: 30, certificates: j([{ key: 'oeko_tex_100' }]), operations: j(['dikim']) }),
      // Tayt ürün grubunda ama ana değil, doğrulanmış.
      B: await mk('B', 'konfeksiyon', 'İstanbul', 'dogrulanmis', { productGroups: j(['tayt', 'tisort']), mainGroups: j(['tisort']), workMode: 'koleksiyon', monthlyCapacity: 60000, moqPerModel: 1000, productionLeadDays: 45, certificates: j([{ key: 'oeko_tex_100' }, { key: 'gots' }]), services: j(['baski']) }),
      // Tayt ana uzmanlık, doğrulanmış, küçük kapasite → A'dan önce (aynı grup sırası, doğrulanmış).
      C: await mk('C', 'konfeksiyon', 'BURSA / Osmangazi', 'dogrulanmis', { productGroups: j(['tayt']), mainGroups: j(['tayt']), workMode: 'ikisi', monthlyCapacity: 20000, moqPerModel: 300, productionLeadDays: 20, certificates: j([{ key: 'bsci' }]) }),
      // Sütyen atölyesi.
      D: await mk('D', 'fason_atolye', 'Bursa', 'dogrulanmamis', { productGroups: j(['sutyen']), mainGroups: j(['sutyen']), monthlyCapacity: 50000, moqPerModel: 500, productionLeadDays: 30, certificates: j([{ key: 'oeko_tex_100' }]) }),
      // Kendi koleksiyonu olan, fason almayan konfeksiyon (atölye aramasında çıkmamalı).
      E: await mk('E', 'konfeksiyon', 'İzmir', 'dogrulanmamis', { productGroups: j(['tayt']), mainGroups: j(['tayt']), workMode: 'koleksiyon', monthlyCapacity: 100000, moqPerModel: 2000, productionLeadDays: 60 }),
    };
  })();
  return seeded;
}

async function names(query: Record<string, unknown>, viewer: string | null = null) {
  const m = await modP!;
  const out = await m.searchApparel({ ...query, limit: 50 }, viewer);
  return { out, list: out.results.filter((r) => r.company.name.startsWith(tag)).map((r) => r.company.name.slice(tag.length + 1)) };
}

test('sıralama: ana uzmanlık > ürün grubunda; aynı sırada doğrulanmış önce, sonra kapasite', { skip: !hasDb }, async () => {
  await seed();
  const { list } = await names({ group: 'tayt' });
  assert.deepEqual(list, ['C', 'E', 'A', 'B']);
});

test('serbest metin: "tayt aylık 50 bin oeko-tex" → yalnız A ve B', { skip: !hasDb }, async () => {
  await seed();
  const { out, list } = await names({ q: 'tayt aylık 50 bin oeko-tex' });
  assert.deepEqual(list, ['A', 'B']);
  assert.equal(out.filters.capacityMin, 50000);
  assert.equal(out.filters.cert, 'oeko_tex_100');
  assert.ok(out.results[0].matchReasons.some((r) => r.startsWith('Ana uzmanlık')));
});

test('"sütyen atölyesi bursa" → D', { skip: !hasDb }, async () => {
  await seed();
  const { list } = await names({ q: 'sütyen atölyesi bursa' });
  assert.deepEqual(list, ['D']);
});

test('atölye: fason atölyeler + fason/ikisi çalışan konfeksiyon; koleksiyon: yalnız konfeksiyon türü', { skip: !hasDb }, async () => {
  await seed();
  assert.deepEqual((await names({ group: 'tayt', kind: 'atolye' })).list, ['C', 'A']);
  assert.deepEqual((await names({ group: 'tayt', kind: 'koleksiyon' })).list, ['C', 'E', 'B']);
});

test('MOQ, termin, hizmet, il süzgeçleri', { skip: !hasDb }, async () => {
  await seed();
  assert.deepEqual((await names({ group: 'tayt', moqMax: 500 })).list, ['C', 'A']);
  assert.deepEqual((await names({ group: 'tayt', leadMax: 30 })).list, ['C', 'A']);
  assert.deepEqual((await names({ group: 'tayt', service: 'baski' })).list, ['B']);
  assert.deepEqual((await names({ group: 'tayt', service: 'dikim' })).list, ['A']);
  assert.deepEqual((await names({ group: 'tayt', city: 'Bursa' })).list, ['C', 'A']);
});

test('çipten kaldırma: off=city metindeki ili yok sayar; açık parametre metni ezer', { skip: !hasDb }, async () => {
  const ids = await seed();
  const { out, list } = await names({ q: 'tayt bursa', off: 'city' });
  assert.equal(out.filters.city, null);
  assert.deepEqual(list, ['C', 'E', 'A', 'B']);
  assert.deepEqual((await names({ q: 'tayt bursa', city: 'İzmir' })).list, ['E']);
  // Kendi firması işaretlenir, hariç tutulmaz.
  const own = await names({ group: 'tayt' }, ids.A);
  assert.equal(own.out.results.find((r) => r.company.id === ids.A)?.isOwn, true);
});

// --- Teklif isteği doğrulaması (veritabanısız) ---
const base = { targetCompanyId: 'c1', productGroup: 'tayt', quantity: 5000, fabricMode: 'firma_onersin' };
const img = 'data:image/jpeg;base64,AAAA';
const pdf = 'data:application/pdf;base64,AAAA';

test('teklif isteği: katalogdan kumaş seçildiyse ürün zorunlu', () => {
  const r = checkApparelRequest({ ...base, fabricMode: 'katalog' });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.error, 'fabric_product_required');
  const ok = checkApparelRequest({ ...base, fabricMode: 'katalog', fabricProductId: 'p1' });
  assert.equal(ok.ok && ok.data.fabricProductId, 'p1');
  // Katalog dışı seçimde ürün bağı tutulmaz.
  const other = checkApparelRequest({ ...base, fabricMode: 'musteri', fabricProductId: 'p1' });
  assert.equal(other.ok && other.data.fabricProductId, null);
});

test('teklif isteği: ek sınırı (en çok 4 görsel ya da tek PDF, boyut)', () => {
  assert.equal(checkApparelRequest({ ...base, attachments: Array(MAX_APPAREL_IMAGES).fill(img) }).ok, true);
  assert.equal(checkApparelRequest({ ...base, attachments: Array(MAX_APPAREL_IMAGES + 1).fill(img) }).ok, false);
  assert.equal(checkApparelRequest({ ...base, attachments: [pdf] }).ok, true);
  const mixed = checkApparelRequest({ ...base, attachments: [pdf, img] });
  assert.equal(!mixed.ok && mixed.error, 'attachments_images_or_one_pdf');
  assert.equal(checkApparelRequest({ ...base, attachments: [pdf, pdf] }).ok, false);
  assert.equal(checkApparelRequest({ ...base, attachments: ['data:image/png;base64,' + 'A'.repeat(800_000)] }).ok, false);
  assert.equal(checkApparelRequest({ ...base, attachments: ['https://x.com/a.png'] }).ok, false);
});

test('teklif isteği: bilinmeyen grup, sıfır adet ve fazla alan reddedilir; tarih okunur', () => {
  assert.equal(checkApparelRequest({ ...base, productGroup: 'uzay' }).ok, false);
  assert.equal(checkApparelRequest({ ...base, quantity: 0 }).ok, false);
  assert.equal(checkApparelRequest({ ...base, price: 3 }).ok, false);
  const r = checkApparelRequest({ ...base, targetDate: '2026-12-01' });
  assert.equal(r.ok && r.data.targetDate?.toISOString().slice(0, 10), '2026-12-01');
});
