import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Telefon normalizasyonu ve çift hesap birleştirme: dev.db'nin GEÇİCİ KOPYASI üzerinde (asıl veriye dokunulmaz).
const src = path.join(__dirname, '..', 'prisma', 'dev.db');
const hasDb = fs.existsSync(src);
const tmp = path.join(os.tmpdir(), `avedon-phone-merge-${process.pid}.db`);
if (hasDb) {
  fs.copyFileSync(src, tmp);
  process.env.DATABASE_URL = `file:${tmp.replace(/\\/g, '/')}`;
}

const modP = hasDb
  ? (async () => ({ ...(await import('./db')), ...(await import('./phoneNormalize')), ...(await import('./conversations')) }))()
  : null;

after(async () => {
  if (modP) await (await modP).prisma.$disconnect();
  try {
    fs.rmSync(tmp, { force: true });
  } catch {
    /* Windows dosyayı kilitli tutabilir */
  }
});

const rnd = () => String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
const base = { accountType: 'uretici', position: 'Sahip', firstName: 'Fatih', lastName: 'Demir', phoneVerified: true };

test('açılış normalizasyonu: tekil numara çevrilir, çakışana dokunulmaz ve raporlanır', { skip: !hasDb }, async () => {
  const m = await modP!;
  const solo = await m.prisma.user.create({ data: { ...base, phone: `+90 53${rnd()}` } });
  const n = rnd();
  const a = await m.prisma.user.create({ data: { ...base, phone: `053${n}` } });
  const b = await m.prisma.user.create({ data: { ...base, phone: `+9053${n}` } });
  const inv = await m.prisma.invite.create({ data: { code: `T${rnd()}`, inviterId: a.id, inviteePhone: `9053${rnd()}` } });

  const before = await m.countDuplicatePhoneGroups();
  const r1 = await m.normalizeStoredPhones();
  assert.ok(r1.duplicateGroups >= 1);
  assert.equal(r1.duplicateGroups, before);
  assert.match((await m.prisma.user.findUniqueOrThrow({ where: { id: solo.id } })).phone, /^053\d{8}$/);
  assert.equal((await m.prisma.user.findUniqueOrThrow({ where: { id: a.id } })).phone, `053${n}`);
  assert.equal((await m.prisma.user.findUniqueOrThrow({ where: { id: b.id } })).phone, `+9053${n}`);
  assert.match((await m.prisma.invite.findUniqueOrThrow({ where: { id: inv.id } })).inviteePhone, /^053\d{8}$/);
  // Tekrar çalıştırmak bir şey değiştirmez.
  const r2 = await m.normalizeStoredPhones();
  assert.equal(r2.usersUpdated, 0);
  assert.equal(r2.invitesUpdated, 0);

  const groups = await m.listDuplicateAccounts();
  const g = groups.find((x) => x.accounts.some((acc) => acc.id === a.id));
  assert.ok(g);
  assert.equal(g!.accounts.length, 2);
  assert.ok(g!.accounts.every((acc) => acc.phone.startsWith('•') && acc.phone.endsWith(n.slice(-4))));
});

test('birleştirme: kayıtlar taşınır, tekil çakışmalar ayıklanır, fazla hesap silinir', { skip: !hasDb }, async () => {
  const m = await modP!;
  const p = m.prisma;
  const n = rnd();
  const company = await p.company.create({ data: { name: `Test ${rnd()}`, companyCode: `T-${rnd()}`, taxId: '' } });
  const keep = await p.user.create({ data: { ...base, phone: `053${n}`, companyId: company.id } });
  const remove = await p.user.create({ data: { ...base, phone: `+9053${n}` } });
  const other = await p.user.create({ data: { ...base, firstName: 'Ayşe', phone: `054${rnd()}` } });
  const third = await p.user.create({ data: { ...base, firstName: 'Can', phone: `055${rnd()}` } });

  const post = await p.post.create({ data: { authorId: remove.id, body: 'kumaş' } as never });
  await p.postLike.create({ data: { postId: post.id, userId: keep.id } });
  await p.postLike.create({ data: { postId: post.id, userId: remove.id } });
  await p.connection.create({ data: { requesterId: keep.id, addresseeId: other.id, status: 'pending' } });
  await p.connection.create({ data: { requesterId: other.id, addresseeId: remove.id, status: 'accepted', respondedAt: new Date() } });
  await p.connection.create({ data: { requesterId: remove.id, addresseeId: third.id, status: 'accepted', respondedAt: new Date() } });
  await p.connection.create({ data: { requesterId: keep.id, addresseeId: remove.id, status: 'accepted' } });
  const cK = await p.conversation.create({ data: m.canonicalPair(keep.id, other.id) });
  const cR = await p.conversation.create({ data: m.canonicalPair(remove.id, other.id) });
  const cR3 = await p.conversation.create({ data: m.canonicalPair(remove.id, third.id) });
  const cSelf = await p.conversation.create({ data: m.canonicalPair(remove.id, keep.id) });
  await p.message.create({ data: { conversationId: cR.id, senderId: remove.id, body: 'merhaba' } });
  await p.message.create({ data: { conversationId: cR3.id, senderId: third.id, body: 'selam' } });
  await p.message.create({ data: { conversationId: cSelf.id, senderId: keep.id, body: 'kendime' } });
  await p.assistantThread.create({ data: { userId: remove.id } as never });

  const diff = await p.company.create({ data: { name: `Test2 ${rnd()}`, companyCode: `T-${rnd()}`, taxId: '' } });
  await p.user.update({ where: { id: remove.id }, data: { companyId: diff.id } });
  assert.deepEqual(await m.mergeAccounts(keep.id, remove.id), { ok: false, error: 'different_companies' });
  await p.user.update({ where: { id: remove.id }, data: { companyId: null } });
  assert.deepEqual(await m.mergeAccounts(keep.id, other.id), { ok: false, error: 'not_duplicates' });

  assert.deepEqual(await m.mergeAccounts(keep.id, remove.id), { ok: true });
  assert.equal(await p.user.findUnique({ where: { id: remove.id } }), null);
  const k = await p.user.findUniqueOrThrow({ where: { id: keep.id } });
  assert.equal(k.phone, `053${n}`);
  assert.equal(k.companyId, company.id);
  assert.equal((await p.post.findUniqueOrThrow({ where: { id: post.id } })).authorId, keep.id);
  assert.equal(await p.postLike.count({ where: { postId: post.id } }), 1);
  // Ayşe ile tek bağlantı kalır ve kabul edilmiş olur; Can'la bağlantı taşınır; kendi kendine bağlantı yok.
  const withOther = await p.connection.findMany({ where: { OR: [{ requesterId: keep.id, addresseeId: other.id }, { requesterId: other.id, addresseeId: keep.id }] } });
  assert.equal(withOther.length, 1);
  assert.equal(withOther[0].status, 'accepted');
  assert.equal(await p.connection.count({ where: { requesterId: keep.id, addresseeId: third.id } }), 1);
  assert.equal(await p.connection.count({ where: { OR: [{ requesterId: keep.id, addresseeId: keep.id }] } }), 0);
  // Ayşe ile sohbetler birleşti; Can'la sohbet keep'e geçti; kendi kendine sohbet silindi.
  assert.equal(await p.conversation.findUnique({ where: { id: cR.id } }), null);
  assert.equal(await p.message.count({ where: { conversationId: cK.id } }), 1);
  assert.deepEqual(
    (({ userAId, userBId }) => ({ userAId, userBId }))(await p.conversation.findUniqueOrThrow({ where: { id: cR3.id } })),
    m.canonicalPair(keep.id, third.id)
  );
  assert.equal(await p.conversation.findUnique({ where: { id: cSelf.id } }), null);
  assert.equal(await p.assistantThread.count({ where: { userId: keep.id } }), 1);
  assert.equal((await m.listDuplicateAccounts()).some((g) => g.accounts.some((a) => a.id === keep.id)), false);
});
