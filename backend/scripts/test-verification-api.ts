// Firma doğrulama başvurusu API testi:
//   node --env-file=.env --import tsx scripts/test-verification-api.ts
import { PrismaClient } from '@prisma/client';
import { signSessionToken } from '../src/auth';

const prisma = new PrismaClient();
const BASE = process.env.API_BASE ?? 'http://localhost:4000/api';
let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) { passed++; console.log(`  ok   ${name}`); } else { failed++; console.log(`  HATA ${name}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 500)); }
}
async function api(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(BASE + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

async function main() {
  const suffix = Date.now().toString().slice(-6);
  const co = await prisma.company.create({ data: { name: `Doğrulama Firma ${suffix}`, taxId: `13${suffix}`, companyCode: `DG-${suffix}` } });
  const owner = await prisma.user.create({ data: { accountType: 'uretici', position: 'Sahip', firstName: 'Basvuran', lastName: 'Test', phone: `0595${suffix}1`, phoneVerified: true, companyId: co.id } });
  const admin = await prisma.user.create({ data: { accountType: 'bireysel', position: 'Yönetici', firstName: 'Gizli', lastName: 'Yonetici', phone: `0595${suffix}2`, phoneVerified: true, isAdmin: true } });
  const other = await prisma.user.create({ data: { accountType: 'bireysel', position: 'Test', firstName: 'Baska', lastName: 'Test', phone: `0595${suffix}3`, phoneVerified: true } });
  const O = signSessionToken(owner.id), A = signSessionToken(admin.id), X = signSessionToken(other.id);
  const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 deneme').toString('base64');
  try {
    console.log('Başvuru');
    check('firmasız kullanıcı 400', (await api('POST', '/verification', X, { document: pdf })).status === 400);
    check('geçersiz belge 400', (await api('POST', '/verification', O, { document: 'data:text/plain;base64,QQ==' })).status === 400);
    const s0 = await api('GET', '/verification', O);
    check('durum: doğrulanmamış, başvuru yok', s0.json?.verification === 'dogrulanmamis' && s0.json.request === null, s0.json);
    const ap = await api('POST', '/verification', O, { document: pdf, note: 'Vergi levhası ektedir.' });
    check('başvuru 201, firma inceleniyor', ap.status === 201 && (await prisma.company.findUnique({ where: { id: co.id } }))?.verification === 'inceleniyor', ap.json);
    check('ikinci başvuru 409', (await api('POST', '/verification', O, { document: pdf })).json?.error === 'request_pending');
    const s1 = await api('GET', '/verification', O);
    check('durum: inceleniyor + bekleyen başvuru; belge yanıtta yok', s1.json?.verification === 'inceleniyor' && s1.json.request?.status === 'pending' && !JSON.stringify(s1.json).includes('base64'), s1.json);
    const adminNotes = (await api('GET', '/notifications', A)).json?.notifications?.filter((n: any) => n.kind === 'verification_request') ?? [];
    check('yöneticiye bildirim', adminNotes.length === 1 && adminNotes[0].data.verificationRequestId === ap.json.request.id, adminNotes);

    console.log('Yönetici');
    check('yönetici olmayan 403', (await api('GET', '/admin/verification-requests', O)).status === 403);
    const list = await api('GET', '/admin/verification-requests', A);
    const row = list.json?.requests?.find((r: any) => r.id === ap.json.request.id);
    check('bekleyen listede firma + başvuran', row?.company?.name === co.name && row.user?.firstName === 'Basvuran' && row.note.includes('Vergi'), list.json);
    check('belge okunur', (await api('GET', `/admin/verification-requests/${row.id}/document`, A)).json?.documentUrl === pdf);
    check('eksik karar 400', (await api('POST', `/admin/verification-requests/${row.id}/decide`, A, { decision: 'belki' })).status === 400);
    check('onay', (await api('POST', `/admin/verification-requests/${row.id}/decide`, A, { decision: 'approve', level: 'belge' })).status === 200);
    const coAfter = await prisma.company.findUnique({ where: { id: co.id } });
    check('firma doğrulandı (belge ile)', coAfter?.verification === 'dogrulanmis' && coAfter.verificationLevel === 'belge' && !!coAfter.verifiedAt);
    check('belge karar sonrası silindi', (await prisma.verificationRequest.findUnique({ where: { id: row.id } }))?.documentUrl === '');
    check('ikinci karar 409', (await api('POST', `/admin/verification-requests/${row.id}/decide`, A, { decision: 'reject' })).json?.error === 'already_decided');
    const ownerNotes = (await api('GET', '/notifications', O)).json?.notifications ?? [];
    const okNote = ownerNotes.find((n: any) => n.kind === 'verification_approved');
    check('firmaya onay bildirimi; yönetici adı geçmez', !!okNote && !JSON.stringify(ownerNotes).includes('Gizli') && !JSON.stringify(ownerNotes).includes('Yonetici'), ownerNotes);
    check('doğrulanmış firma yeniden başvuramaz 409', (await api('POST', '/verification', O, { document: pdf })).json?.error === 'already_verified');

    console.log('Red');
    await prisma.company.update({ where: { id: co.id }, data: { verification: 'dogrulanmamis', verificationLevel: '', verifiedAt: null } });
    const ap2 = await api('POST', '/verification', O, { document: pdf });
    await api('POST', `/admin/verification-requests/${ap2.json.request.id}/decide`, A, { decision: 'reject', adminNote: 'Belge okunmuyor.' });
    const s2 = await api('GET', '/verification', O);
    check('red: firma doğrulanmamış, not görünür', s2.json?.verification === 'dogrulanmamis' && s2.json.request?.status === 'rejected' && s2.json.request.adminNote === 'Belge okunmuyor.', s2.json);
    check('red bildirimi not içerir', ((await api('GET', '/notifications', O)).json?.notifications ?? []).some((n: any) => n.kind === 'verification_rejected' && n.body.includes('okunmuyor')));
    check('reddedilen yeniden başvurabilir', (await api('POST', '/verification', O, { document: pdf })).status === 201);
  } finally {
    const ids = [owner.id, admin.id, other.id];
    await prisma.verificationRequest.deleteMany({ where: { companyId: co.id } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.company.deleteMany({ where: { id: co.id } });
    await prisma.$disconnect();
  }
  console.log(`\nSonuç: ${passed} geçti, ${failed} başarısız`);
  process.exit(failed ? 1 : 0);
}
main().catch(async (err) => { console.error(err); await prisma.$disconnect(); process.exit(1); });
