// Karşılıklı referans, doğrulama düzeyi ve kapasite araması sayfalaması (Faz 2, Adım 7)
// uçtan uca API testi. Çalışan yerel sunucuya karşı:
//   node --env-file=.env --import tsx scripts/test-references-api.ts
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
  const mkCo = (n: string, tax: string) => prisma.company.create({ data: { name: `${n} ${suffix}`, taxId: `${tax}${suffix}`, companyCode: `R${tax}-${suffix}` } });
  const [a, b, c] = await Promise.all([mkCo('Ref Örme', '71'), mkCo('Ref Konfeksiyon', '72'), mkCo('Ref Üçüncü', '73')]);
  const mk = (phone: string, companyId: string | null, isAdmin = false) =>
    prisma.user.create({ data: { accountType: 'uretici', position: 'Test', firstName: 'Test', lastName: phone, phone, phoneVerified: true, companyId, isAdmin } });
  const ua = await mk(`0561${suffix}`, a.id);
  const ub = await mk(`0562${suffix}`, b.id);
  const uc = await mk(`0563${suffix}`, c.id);
  const loner = await mk(`0564${suffix}`, null);
  const [A, B, C, L] = [ua, ub, uc, loner].map((u) => signSessionToken(u.id));
  const extraCompanies: string[] = [];

  try {
    console.log('Referans isteği');
    check('firmasız 403', (await api('POST', '/references', L, { toCompanyId: a.id, relation: 'musteri' })).status === 403);
    check('kendine referans 400', (await api('POST', '/references', A, { toCompanyId: a.id, relation: 'musteri' })).json?.error === 'own_company');
    check('geçersiz ilişki 400', (await api('POST', '/references', A, { toCompanyId: b.id, relation: 'ortak' })).status === 400);
    const r = await api('POST', '/references', A, { toCompanyId: b.id, relation: 'musteri', note: '2019\'dan beri çalışıyoruz' });
    check('A: "B müşterimiz" 201 pending', r.status === 201 && r.json?.reference?.status === 'pending' && r.json.reference.relation === 'musteri' && r.json.reference.direction === 'given', r.json);
    check('aynısı tekrar 409', (await api('POST', '/references', A, { toCompanyId: b.id, relation: 'musteri' })).status === 409);
    check('ayna kayıt da 409 (B: "A tedarikçimiz")', (await api('POST', '/references', B, { toCompanyId: a.id, relation: 'tedarikci' })).status === 409);
    check('B\'ye bildirim', (await api('GET', '/notifications', B)).json?.notifications?.some((n: any) => n.kind === 'reference_request' && n.data?.referenceId === r.json.reference.id));

    console.log('Görünürlük (onaydan önce)');
    check('dışarıdan görünmez', (await api('GET', `/references/company/${a.id}`, C)).json?.references?.length === 0 && (await api('GET', `/references/company/${a.id}`)).json?.pendingOutgoing?.length === 0);
    check('A bekleyen gideni görür', (await api('GET', `/references/company/${a.id}`, A)).json?.pendingOutgoing?.length === 1);
    const inc = await api('GET', `/references/company/${b.id}`, B);
    check('B bekleyen geleni görür; ilişki B açısından "tedarikci"', inc.json?.pendingIncoming?.[0]?.relation === 'tedarikci' && inc.json.pendingIncoming[0].company.id === a.id, inc.json);

    console.log('Onay');
    check('üçüncü firma onaylayamaz 404', (await api('POST', `/references/${r.json.reference.id}/respond`, C, { action: 'confirm' })).status === 404);
    check('isteği yapan kendi onaylayamaz 404', (await api('POST', `/references/${r.json.reference.id}/respond`, A, { action: 'confirm' })).status === 404);
    const ok = await api('POST', `/references/${r.json.reference.id}/respond`, B, { action: 'confirm' });
    check('B onaylar', ok.json?.reference?.status === 'confirmed', ok.json);
    check('ikinci yanıt 409', (await api('POST', `/references/${r.json.reference.id}/respond`, B, { action: 'reject' })).status === 409);
    check('A\'ya bildirim', (await api('GET', '/notifications', A)).json?.notifications?.some((n: any) => n.kind === 'reference_confirmed'));
    const pubA = await api('GET', `/references/company/${a.id}`);
    const pubB = await api('GET', `/references/company/${b.id}`);
    check('A sayfasında B "müşteri", oturumsuz da görünür', pubA.json?.references?.[0]?.relation === 'musteri' && pubA.json.references[0].company.id === b.id && pubA.json.confirmedCount === 1, pubA.json);
    check('B sayfasında A "tedarikçi"', pubB.json?.references?.[0]?.relation === 'tedarikci' && pubB.json.references[0].company.id === a.id, pubB.json);

    console.log('Ret ve kaldırma');
    const r2 = await api('POST', '/references', C, { toCompanyId: a.id, relation: 'tedarikci' });
    await api('POST', `/references/${r2.json.reference.id}/respond`, A, { action: 'reject' });
    check('reddedilen dışarıdan görünmez', !(await api('GET', `/references/company/${a.id}`)).json?.references?.some((x: any) => x.company.id === c.id));
    check('üçüncü firma silemez 404', (await api('DELETE', `/references/${r.json.reference.id}`, C)).status === 404);
    check('karşı taraf (B) kaldırabilir 204', (await api('DELETE', `/references/${r.json.reference.id}`, B)).status === 204);
    check('kaldırılınca iki sayfadan da gider', (await api('GET', `/references/company/${a.id}`)).json?.confirmedCount === 0);

    console.log('Doğrulama düzeyi (admin)');
    const admin = await mk(`0565${suffix}`, null, true);
    const AD = signSessionToken(admin.id);
    const v = await api('PATCH', `/admin/companies/${a.id}/verification`, AD, { verification: 'dogrulanmis', level: 'ziyaret' });
    if (v.status === 200) {
      const row = await prisma.company.findUnique({ where: { id: a.id } });
      check('düzey ve tarih yazıldı', row?.verificationLevel === 'ziyaret' && !!row?.verifiedAt, row);
      await api('PATCH', `/admin/companies/${a.id}/verification`, AD, { verification: 'inceleniyor' });
      const row2 = await prisma.company.findUnique({ where: { id: a.id } });
      check('doğrulama geri alınınca düzey ve tarih temizlenir', row2?.verificationLevel === '' && row2?.verifiedAt === null, row2);
    } else {
      check(`admin ucu erişilebilir (durum ${v.status})`, false, v.json);
    }
    await prisma.user.delete({ where: { id: admin.id } });

    console.log('Kapasite araması sayfalaması');
    for (let i = 0; i < 5; i++) {
      const co = await prisma.company.create({ data: { name: `Sayfa ${suffix}-${i}`, taxId: `6${i}${suffix}`, companyCode: `SY${i}-${suffix}`, machines: { create: [{ group: 'diger', kind: `Sayfalama ${suffix}`, kindKey: `sayfalama ${suffix}` }] } } });
      extraCompanies.push(co.id);
    }
    const p1 = await api('GET', `/machines/search?kind=${encodeURIComponent(`Sayfalama ${suffix}`)}&limit=2`, A);
    check('ilk sayfa 2 sonuç, devamı var', p1.json?.results?.length === 2 && p1.json?.hasMore === true && p1.json?.nextOffset === 2, p1.json);
    const p3 = await api('GET', `/machines/search?kind=${encodeURIComponent(`Sayfalama ${suffix}`)}&limit=2&offset=4`, A);
    check('son sayfa 1 sonuç, devamı yok', p3.json?.results?.length === 1 && p3.json?.hasMore === false && p3.json?.nextOffset === null, p3.json);
    const all = new Set<string>();
    for (const off of [0, 2, 4]) (await api('GET', `/machines/search?kind=${encodeURIComponent(`Sayfalama ${suffix}`)}&limit=2&offset=${off}`, A)).json?.results?.forEach((x: any) => all.add(x.company.id));
    check('sayfalar toplamı 5 ayrı firma', all.size === 5, all.size);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [ua.id, ub.id, uc.id, loner.id] } } });
    await prisma.company.deleteMany({ where: { id: { in: [a.id, b.id, c.id, ...extraCompanies] } } });
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
