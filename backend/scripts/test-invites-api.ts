// Davet mekaniği (Faz 2, Adım 4) uçtan uca API testi:
//   node --env-file=.env --import tsx scripts/test-invites-api.ts
import { PrismaClient } from '@prisma/client';
import { signSessionToken, signVerificationTicket } from '../src/auth';

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
    console.log(`  HATA ${name}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 500));
  }
}

async function api(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

async function main() {
  const suffix = Date.now().toString().slice(-6);
  const co = await prisma.company.create({ data: { name: `Davet Firma ${suffix}`, taxId: `11${suffix}`, companyCode: `DV-${suffix}` } });
  const inviter = await prisma.user.create({ data: { accountType: 'uretici', position: 'Test', firstName: 'Davet', lastName: 'Eden', phone: `0591${suffix}1`, phoneVerified: true, companyId: co.id } });
  const member = await prisma.user.create({ data: { accountType: 'bireysel', position: 'Test', firstName: 'Zaten', lastName: 'Üye', phone: `0591${suffix}2`, phoneVerified: true } });
  const I = signSessionToken(inviter.id);
  const phoneA = `0591${suffix}3`;
  const phoneB = `0591${suffix}4`;
  const phoneC = `0591${suffix}5`;
  const created: string[] = [];
  const register = async (phone: string, first: string, inviteCode?: string) => {
    const r = await api('POST', '/register', undefined, { accountType: 'bireysel', position: 'Satın alma', firstName: first, lastName: 'Test', phone, verificationToken: signVerificationTicket(phone), ...(inviteCode ? { inviteCode } : {}) });
    if (r.json?.user?.id) created.push(r.json.user.id);
    return r;
  };
  const connection = (x: string, y: string) => prisma.connection.findFirst({ where: { OR: [{ requesterId: x, addresseeId: y }, { requesterId: y, addresseeId: x }] } });

  try {
    console.log('Davet oluşturma');
    check('oturumsuz 401', (await api('POST', '/invites', undefined, {})).status === 401);
    check('geçersiz telefon 400', (await api('POST', '/invites', I, { phone: '123' })).json?.error === 'invalid_phone');
    check('kendi numarası 400', (await api('POST', '/invites', I, { phone: inviter.phone })).json?.error === 'own_phone');
    const already = await api('POST', '/invites', I, { phone: member.phone });
    check('zaten üye 409 + kullanıcı bilgisi', already.status === 409 && already.json?.user?.id === member.id, already.json);
    const inv = await api('POST', '/invites', I, { name: 'Ahmet Bey', phone: `+90 ${phoneA.slice(1, 4)} ${phoneA.slice(4)}`, relation: 'tedarikci' });
    check('davet 201: kod, bağlantı, paylaşım metni', inv.status === 201 && /^[A-Z2-9]{8}$/.test(inv.json?.invite?.code) && inv.json.invite.url.includes(`?davet=${inv.json.invite.code}`) && inv.json.invite.shareText.includes(co.name) && inv.json.invite.shareText.includes(inv.json.invite.code), inv.json);
    check('telefon normalleştirildi', inv.json?.invite?.phone === phoneA, inv.json?.invite?.phone);
    const again = await api('POST', '/invites', I, { phone: phoneA });
    check('aynı numaraya ikinci davet: mevcut davet döner', again.status === 200 && again.json?.reused === true && again.json.invite.id === inv.json.invite.id);
    const open = await api('POST', '/invites', I, { relation: 'musteri' });
    check('telefonsuz (açık) davet', open.status === 201 && open.json.invite.phone === '' && /Ürünlerimi/.test(open.json.invite.shareText), open.json?.invite?.shareText);

    console.log('Karşılama (oturumsuz)');
    const hello = await api('GET', `/invites/code/${inv.json.invite.code.toLowerCase()}`);
    check('kim davet etti: ad ve firma; telefon sızmaz', hello.json?.invite?.inviterName === 'Davet Eden' && hello.json.invite.inviterCompany === co.name && !JSON.stringify(hello.json).includes(phoneA), hello.json);
    check('olmayan kod 404', (await api('GET', '/invites/code/YOKYOKYO')).status === 404);

    console.log('Kayıt → bağlantı');
    const regA = await register(phoneA, 'Ahmet', inv.json.invite.code);
    check('davetli kayıt 201', regA.status === 201, regA.json);
    const cA = await connection(inviter.id, regA.json.user.id);
    check('numarası eşleşen davetli: doğrudan BAĞLANTI', cA?.status === 'accepted', cA);
    const regB = await register(phoneB, 'Burak', open.json.invite.code);
    const cB = await connection(inviter.id, regB.json.user.id);
    check('açık davetle gelen: BEKLEYEN istek (davet eden onaylar)', cB?.status === 'pending' && cB.requesterId === regB.json.user.id, cB);
    const inv2 = await api('POST', '/invites', I, { phone: phoneC });
    const regC = await register(phoneC, 'Cem');
    const cC = await connection(inviter.id, regC.json.user.id);
    check('kod yazmadan kayıt olsa da numarasına açık davet işler', cC?.status === 'accepted' && inv2.status === 201, cC);
    check('geçersiz kod kaydı engellemez', (await register(`0591${suffix}6`, 'Deniz', 'OLMAYAN1')).status === 201);

    console.log('Davet listesi ve bildirim');
    const list = await api('GET', '/invites', I);
    const rowA = list.json?.invites?.find((x: any) => x.id === inv.json.invite.id);
    check('katılanlar işaretli ve kimin katıldığı görünür', list.json?.joinedCount === 3 && rowA?.status === 'joined' && rowA.joinedUser?.firstName === 'Ahmet', list.json?.invites?.map((x: any) => [x.status, x.joinedUser?.firstName]));
    const notes = (await api('GET', '/notifications', I)).json?.notifications?.filter((n: any) => n.kind === 'invite_joined') ?? [];
    check('her katılımda bildirim (3)', notes.length === 3 && notes.some((n: any) => /Ahmet/.test(n.title) && /Artık bağlantınız/.test(n.body)) && notes.some((n: any) => /Burak/.test(n.title) && /onaylarsanız/.test(n.body)), notes.map((n: any) => n.title));

    console.log('İptal ve sınır');
    const spare = await api('POST', '/invites', I, { name: 'Vazgeçilen' });
    check('bekleyen davet iptal edilir ve kodu geçersizleşir', (await api('DELETE', `/invites/${spare.json.invite.id}`, I)).status === 204 && (await api('GET', `/invites/code/${spare.json.invite.code}`)).status === 404);
    check('katılmış davet iptal edilemez 409', (await api('DELETE', `/invites/${inv.json.invite.id}`, I)).status === 409);
    check('başkasının daveti 404', (await api('DELETE', `/invites/${inv.json.invite.id}`, signSessionToken(member.id))).status === 404);
    await prisma.invite.createMany({ data: Array.from({ length: 20 }, (_, i) => ({ code: `T${suffix}${String(i).padStart(2, '0')}`.slice(0, 8).padEnd(8, 'X') + i, inviterId: inviter.id })) });
    check('günlük 20 davet sınırı 429', (await api('POST', '/invites', I, {})).status === 429);
  } finally {
    const ids = [inviter.id, member.id, ...created];
    await prisma.invite.deleteMany({ where: { inviterId: inviter.id } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.connection.deleteMany({ where: { OR: [{ requesterId: { in: ids } }, { addresseeId: { in: ids } }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.company.deleteMany({ where: { id: co.id } });
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
