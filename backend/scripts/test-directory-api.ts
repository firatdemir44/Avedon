// Firma rehberi (içe aktarma, arama, sahiplenme) API testi:
//   node --env-file=.env --import tsx scripts/test-directory-api.ts
import { PrismaClient } from '@prisma/client';
import { signSessionToken } from '../src/auth';
import { normalizeName } from '../src/directory';

const prisma = new PrismaClient();
const BASE = process.env.API_BASE ?? 'http://localhost:4000/api';
let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) { passed++; console.log(`  ok   ${name}`); } else { failed++; console.log(`  HATA ${name}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 600)); }
}
async function api(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(BASE + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

async function main() {
  const suffix = Date.now().toString().slice(-6);
  const tag = `Rhb${suffix}`;
  const admin = await prisma.user.create({ data: { accountType: 'bireysel', position: 'Yönetici', firstName: 'Rehber', lastName: 'Admin', phone: `0597${suffix}1`, phoneVerified: true, isAdmin: true } });
  const owner = await prisma.user.create({ data: { accountType: 'bireysel', position: 'Sahip', firstName: 'Rehber', lastName: 'Sahip', phone: `0597${suffix}2`, phoneVerified: true } });
  const other = await prisma.user.create({ data: { accountType: 'bireysel', position: 'Test', firstName: 'Rehber', lastName: 'Diger', phone: `0597${suffix}3`, phoneVerified: true } });
  const unverified = await prisma.user.create({ data: { accountType: 'bireysel', position: 'Test', firstName: 'Rehber', lastName: 'Onaysiz', phone: `0597${suffix}4`, phoneVerified: false } });
  const A = signSessionToken(admin.id), O = signSessionToken(owner.id), X = signSessionToken(other.id), U = signSessionToken(unverified.id);
  const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 vergi levhasi').toString('base64');
  const ids = [admin.id, owner.id, other.id, unverified.id];

  try {
    console.log('Ad sadeleştirme');
    check('şirket ekleri düşer, Türkçe harf sadeleşir', normalizeName('MELİDE TEKSTİL SAN. VE TİC. LTD. ŞTİ.') === 'melide tekstil' && normalizeName('Çağdaş Örme A.Ş.') === 'cagdas orme', [normalizeName('MELİDE TEKSTİL SAN. VE TİC. LTD. ŞTİ.'), normalizeName('Çağdaş Örme A.Ş.')]);

    console.log('İçe aktarma');
    check('yönetici olmayan 403', (await api('POST', '/admin/directory/import', O, { rows: [{ name: `${tag} A`, category: 'iplik' }] })).status === 403);
    check('geçersiz kategori 400', (await api('POST', '/admin/directory/import', A, { rows: [{ name: `${tag} A`, category: 'yok' }] })).status === 400);
    const imp = await api('POST', '/admin/directory/import', A, {
      rows: [
        { name: `${tag} Polyester İplik San. Tic. Ltd. Şti.`, category: 'iplik', city: 'Bursa', source: 'orsad' },
        { name: `${tag} POLYESTER IPLIK SAN TIC LTD STI`, category: 'iplik', city: 'Bursa' },
        { name: `${tag} Örme Kumaş A.Ş.`, category: 'kumas_uretici', city: 'İstanbul', website: 'https://ornek.test', tags: ['boyahane'] },
        { name: `${tag} Konfeksiyon`, category: 'konfeksiyon' },
      ],
    });
    check('3 eklendi, 1 mükerrer atlandı', imp.json?.created === 3 && imp.json.skipped?.length === 1 && imp.json.skipped[0].reason === 'duplicate_in_file', imp.json);
    const again = await api('POST', '/admin/directory/import', A, { rows: [{ name: `${tag} Polyester İplik`, category: 'iplik' }] });
    check('veritabanındaki firma tekrar eklenmez', again.json?.created === 0 && again.json.skipped[0].reason === 'exists', again.json);

    console.log('Rehber');
    check('oturumsuz 401', (await api('GET', '/directory')).status === 401);
    const all = await api('GET', `/directory?q=${encodeURIComponent(tag)}`, O);
    check('arama: 3 sahipsiz firma', all.json?.total === 3 && all.json.companies.every((c: any) => c.claimed === false), all.json);
    const tr = await api('GET', `/directory?q=${encodeURIComponent(tag.toLowerCase() + ' orme kumas')}`, O);
    check('Türkçe harf duyarsız arama', tr.json?.total === 1 && tr.json.companies[0].category === 'kumas_uretici' && tr.json.companies[0].tags.includes('boyahane') && tr.json.companies[0].categoryLabel === 'Kumaş Üreticisi', tr.json);
    const byTag = await api('GET', `/directory?q=${encodeURIComponent(tag)}&category=boyahane`, O);
    check('ek etiketle kategori süzmesi', byTag.json?.total === 1 && byTag.json.companies[0].name.includes('Örme'), byTag.json);
    check('kategori sayıları döner', Array.isArray(all.json?.categories) && all.json.categories.some((c: any) => c.key === 'iplik' && c.count >= 1));
    check('sayfalama', (await api('GET', `/directory?q=${encodeURIComponent(tag)}&limit=2`, O)).json?.nextOffset === 2);
    const yarnCo = all.json.companies.find((c: any) => c.category === 'iplik');

    console.log('Sahiplenme');
    check('telefonu onaysız 403', (await api('POST', `/directory/${yarnCo.id}/claim`, U, { document: pdf })).json?.error === 'phone_not_verified');
    check('belgesiz 400', (await api('POST', `/directory/${yarnCo.id}/claim`, O, {})).status === 400);
    const claim = await api('POST', `/directory/${yarnCo.id}/claim`, O, { document: pdf, note: 'Vergi levhamız ektedir.' });
    check('sahiplenme başvurusu 201, firma inceleniyor', claim.status === 201 && (await prisma.company.findUnique({ where: { id: yarnCo.id } }))?.verification === 'inceleniyor', claim.json);
    check('başkası aynı firmaya 409', (await api('POST', `/directory/${yarnCo.id}/claim`, X, { document: pdf })).json?.error === 'claim_pending_by_other');
    check('kendi başvurum görünür', (await api('GET', '/directory/my-claim', O)).json?.claim?.status === 'pending');
    const adminNotes = (await api('GET', '/notifications', A)).json?.notifications?.filter((n: any) => n.kind === 'verification_request') ?? [];
    check('yöneticiye sahiplenme bildirimi', adminNotes.some((n: any) => n.title.includes('sahiplenme')), adminNotes.map((n: any) => n.title));
    const list = await api('GET', '/admin/verification-requests', A);
    const reqRow = list.json?.requests?.find((r: any) => r.id === claim.json.request.id);
    check('yönetici listesinde claim işaretli', reqRow?.claim === true && reqRow.company?.name?.includes('Polyester'), reqRow);
    check('onay', (await api('POST', `/admin/verification-requests/${reqRow.id}/decide`, A, { decision: 'approve', level: 'belge' })).status === 200);
    const co = await prisma.company.findUnique({ where: { id: yarnCo.id } });
    const u = await prisma.user.findUnique({ where: { id: owner.id } });
    check('firma sahipli + doğrulanmış, kullanıcı firmaya bağlandı', co?.claimed === true && co.verification === 'dogrulanmis' && u?.companyId === yarnCo.id, { co, u });
    check('sahibine "artık sizin" bildirimi', ((await api('GET', '/notifications', O)).json?.notifications ?? []).some((n: any) => n.kind === 'verification_approved' && n.title.includes('artık sizin')));
    check('sahipli firma tekrar sahiplenilemez 409', (await api('POST', `/directory/${yarnCo.id}/claim`, X, { document: pdf })).json?.error === 'already_claimed');
    check('artık firması olan kullanıcı başka firma sahiplenemez 400', (await api('POST', `/directory/${all.json.companies.find((c: any) => c.category === 'konfeksiyon').id}/claim`, O, { document: pdf })).json?.error === 'already_has_company');
    const claimedList = await api('GET', `/directory?q=${encodeURIComponent(tag)}&claimed=claimed`, X);
    check('sahipli süzgeci ve sahipliler önde', claimedList.json?.total === 1 && (await api('GET', `/directory?q=${encodeURIComponent(tag)}`, X)).json.companies[0].id === yarnCo.id);

    console.log('Red');
    const konfCo = all.json.companies.find((c: any) => c.category === 'konfeksiyon');
    const c2 = await api('POST', `/directory/${konfCo.id}/claim`, X, { document: pdf });
    await api('POST', `/admin/verification-requests/${c2.json.request.id}/decide`, A, { decision: 'reject', adminNote: 'Belge bu firmaya ait değil.' });
    const co2 = await prisma.company.findUnique({ where: { id: konfCo.id } });
    const u2 = await prisma.user.findUnique({ where: { id: other.id } });
    check('red: firma sahipsiz kalır, kullanıcı bağlanmaz, ret bildirimi', co2?.claimed === false && u2?.companyId === null && ((await api('GET', '/notifications', X)).json?.notifications ?? []).some((n: any) => n.kind === 'verification_rejected' && n.body.includes('ait değil')));
  } finally {
    const cos = await prisma.company.findMany({ where: { name: { startsWith: tag } }, select: { id: true } });
    await prisma.verificationRequest.deleteMany({ where: { companyId: { in: cos.map((c) => c.id) } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.company.deleteMany({ where: { id: { in: cos.map((c) => c.id) } } });
    await prisma.$disconnect();
  }
  console.log(`\nSonuç: ${passed} geçti, ${failed} başarısız`);
  process.exit(failed ? 1 : 0);
}
main().catch(async (err) => { console.error(err); await prisma.$disconnect(); process.exit(1); });
