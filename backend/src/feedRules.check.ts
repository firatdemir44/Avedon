// Akış kurallarının uçtan uca provası (gerçek veritabanı KOPYASI üzerinde çalıştırılır):
//   cp prisma/dev.db $TEMP/feedcheck.db
//   DATABASE_URL=file:$TEMP/feedcheck.db ANTHROPIC_MOCK=1 npx.cmd tsx src/feedRules.check.ts
// Kendi oluşturduğu kayıtları sonunda siler.
import assert from 'node:assert/strict';
import { prisma } from './db';
import { checkTextileRelevance, feedFilters, publicPostRule, reportPost } from './feedRules';

async function main() {
  if (!/feedcheck/.test(process.env.DATABASE_URL ?? '')) throw new Error('Yalnızca feedcheck kopya veritabanında çalışır');
  const tag = `fc${Date.now()}`;
  const mkCompany = (i: number, type: string, verification = 'dogrulanmis') =>
    prisma.company.create({ data: { name: `${tag}-firma${i}`, taxId: `${tag}${i}`, companyCode: `${tag}${i}`, companyType: type, verification } });
  const mkUser = (i: number, companyId: string) =>
    prisma.user.create({ data: { accountType: 'company', position: 'x', firstName: `U${i}`, lastName: tag, phone: `+90${tag}${i}`, companyId } as never });

  const cA = await mkCompany(1, 'aksesuar');
  const cB = await mkCompany(2, 'konfeksiyon');
  const cC = await mkCompany(3, 'iplik', 'dogrulanmamis');
  const others = await Promise.all([4, 5, 6, 7, 8].map((i) => mkCompany(i, 'kumas_uretici')));
  const uA = await mkUser(1, cA.id);
  const uB = await mkUser(2, cB.id);
  const uC = await mkUser(3, cC.id);
  const reporters = await Promise.all(others.map((c, i) => mkUser(10 + i, c.id)));

  // 1. Doğrulanmamış firma genele yazamaz.
  assert.equal((await publicPostRule({ id: uC.id, companyId: cC.id })).reason, 'not_verified');
  // 2. Günlük sınır: 2 genel gönderiden sonra kapalı.
  assert.equal((await publicPostRule({ id: uA.id, companyId: cA.id })).allowed, true);
  const p1 = await prisma.post.create({ data: { authorId: uA.id, body: 'Yeni çıtçıt serisi', visibility: 'public' } });
  await prisma.post.create({ data: { authorId: uA.id, body: 'Metal düğme', visibility: 'public' } });
  const r = await publicPostRule({ id: uA.id, companyId: cA.id });
  assert.equal(r.reason, 'daily_limit');
  assert.ok(r.nextAllowedAt);
  // Düzenlemede kendisi sayılmaz.
  assert.equal((await publicPostRule({ id: uA.id, companyId: cA.id }, { excludePostId: p1.id })).allowed, true);

  // 3. İçerik denetimi (mock): kedi paylaşımı reddedilir, ürünlü paylaşım denetlenmez.
  assert.equal((await checkTextileRelevance({ body: 'Kedim bugün çok tatlı' })).textile, false);
  assert.equal((await checkTextileRelevance({ body: 'Kedim', productAttached: true })).textile, true);

  // 4. Şikâyet: aynı firmadan tekrar sayılmaz; 3 farklı firma → gizlenir.
  await reportPost({ id: reporters[0].id, companyId: others[0].id }, p1.id, 'tekrar', '');
  assert.equal((await reportPost({ id: reporters[0].id, companyId: others[0].id }, p1.id, 'tekrar', '')).status, 'already');
  await reportPost({ id: reporters[1].id, companyId: others[1].id }, p1.id, 'alakasiz', '');
  let hidden = await prisma.post.findUnique({ where: { id: p1.id } });
  assert.equal(hidden!.hiddenAt, null);
  const third = await reportPost({ id: reporters[2].id, companyId: others[2].id }, p1.id, 'tekrar', '');
  assert.equal(third.status === 'ok' && third.hidden, true);
  // Kendi gönderisini şikâyet edemez.
  assert.equal((await reportPost({ id: uA.id, companyId: cA.id }, p1.id, 'diger', '')).status, 'own_post');

  // Gizli gönderi başkasının akışına gelmez, yazarınkine gelir.
  const visibleTo = async (uid: string, cid: string) =>
    prisma.post.count({ where: { id: p1.id, AND: await feedFilters({ id: uid, companyId: cid }, [], { forMe: false }) } });
  assert.equal(await visibleTo(uB.id, cB.id), 0);
  assert.equal(await visibleTo(uA.id, cA.id), 1);

  // 5. 5 farklı firmadan şikâyet → firma 14 gün genele yazamaz.
  const p3 = await prisma.post.create({ data: { authorId: uA.id, body: 'Fermuar', visibility: 'connections' } });
  await reportPost({ id: reporters[3].id, companyId: others[3].id }, p3.id, 'tekrar', '');
  const fifth = await reportPost({ id: reporters[4].id, companyId: others[4].id }, p3.id, 'tekrar', '');
  assert.equal(fifth.status === 'ok' && fifth.companyBlocked, true);
  assert.equal((await publicPostRule({ id: uA.id, companyId: cA.id }, { excludePostId: p1.id })).reason, 'blocked');

  // 6. Firma gizleme.
  const p4 = await prisma.post.create({ data: { authorId: uC.id, body: 'Penye iplik', visibility: 'public' } });
  await prisma.feedMute.create({ data: { userId: uB.id, companyId: cC.id } });
  assert.equal(await prisma.post.count({ where: { id: p4.id, AND: await feedFilters({ id: uB.id, companyId: cB.id }, [], { forMe: false }) } }), 0);

  // 7. "Benim için": konfeksiyoncu iplikçiyi görmez, aksesuarcıyı görür.
  await prisma.feedMute.deleteMany({ where: { userId: uB.id } });
  const p5 = await prisma.post.create({ data: { authorId: uA.id, body: 'Çıtçıt', visibility: 'public' } });
  const forB = await feedFilters({ id: uB.id, companyId: cB.id }, [], { forMe: true });
  assert.equal(await prisma.post.count({ where: { id: p4.id, AND: forB } }), 0);
  assert.equal(await prisma.post.count({ where: { id: p5.id, AND: forB } }), 1);

  // Temizlik
  const users = [uA, uB, uC, ...reporters].map((u) => u.id);
  await prisma.postReport.deleteMany({ where: { reporterId: { in: users } } });
  await prisma.feedMute.deleteMany({ where: { userId: { in: users } } });
  await prisma.post.deleteMany({ where: { authorId: { in: users } } });
  console.log('feedRules: tüm kontroller geçti');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
