import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

// Ekip arkadaşı daveti: yerel geliştirme veritabanının GEÇİCİ KOPYASI üzerinde kayıt rotası uçtan uca
// denenir (asıl dev.db'ye dokunulmaz). Kopya yoksa (dev.db kurulmamış makine) testler atlanır.
const src = path.join(__dirname, '..', 'prisma', 'dev.db');
const hasDb = fs.existsSync(src);
const tmp = path.join(os.tmpdir(), `avedon-team-invite-${process.pid}.db`);
if (hasDb) {
  fs.copyFileSync(src, tmp);
  process.env.DATABASE_URL = `file:${tmp.replace(/\\/g, '/')}`;
}

async function setup() {
  const express = (await import('express')).default;
  const { prisma } = await import('./db');
  const { registerRouter } = await import('./routes/register');
  const { signVerificationTicket } = await import('./auth');
  const app = express();
  app.use(express.json());
  app.use('/api/register', registerRouter);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/register`;
  return { prisma, server, base, signVerificationTicket };
}

const ctxP = hasDb ? setup() : null;
after(async () => {
  if (ctxP) {
    const c = await ctxP;
    c.server.close();
    await c.prisma.$disconnect();
  }
  try {
    fs.rmSync(tmp, { force: true });
  } catch {
    /* Windows dosyayı kilitli tutabilir */
  }
});

const rnd = () => String(Math.floor(Math.random() * 1e9)).padStart(9, '0');

async function makeInviter() {
  const c = await ctxP!;
  const company = await c.prisma.company.create({ data: { name: `Test Örme ${rnd()}`, companyCode: `T-${rnd()}`, taxId: "" } });
  const inviter = await c.prisma.user.create({
    data: { accountType: 'uretici', position: 'Sahip', firstName: 'Ali', lastName: 'Veren', phone: `05${rnd()}`, phoneVerified: true, companyId: company.id },
  });
  const colleague = await c.prisma.user.create({
    data: { accountType: 'uretici', position: 'Satış', firstName: 'Ayşe', lastName: 'Ekip', phone: `05${rnd()}`, phoneVerified: true, companyId: company.id },
  });
  return { company, inviter, colleague };
}

async function register(body: Record<string, unknown>) {
  const c = await ctxP!;
  const phone = String(body.phone);
  const r = await fetch(c.base, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accountType: 'bireysel', position: 'Çalışan', firstName: 'Yeni', lastName: 'Kişi', verificationToken: c.signVerificationTicket(phone), ...body }),
  });
  return { status: r.status, json: (await r.json()) as any };
}

test('ekip davetiyle kayıt: davet edenin firmasına katılır, yeni firma açılmaz, bağlantı + bildirim', { skip: !hasDb }, async () => {
  const c = await ctxP!;
  const { company, inviter, colleague } = await makeInviter();
  const invite = await c.prisma.invite.create({ data: { code: `EK${rnd()}`, inviterId: inviter.id, inviterCompanyId: company.id, relation: 'ekip' } });
  const companiesBefore = await c.prisma.company.count();
  const phone = `05${rnd()}`;
  const r = await register({ phone, inviteCode: invite.code.toLowerCase(), companyName: 'Yok sayılmalı' });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.user.companyId, company.id);
  assert.equal(r.json.user.accountType, 'uretici');
  assert.equal(await c.prisma.company.count(), companiesBefore);
  const conn = await c.prisma.connection.findFirst({ where: { requesterId: inviter.id, addresseeId: r.json.user.id } });
  assert.equal(conn?.status, 'accepted');
  const updated = await c.prisma.invite.findUniqueOrThrow({ where: { id: invite.id } });
  assert.equal(updated.status, 'joined');
  assert.equal(updated.joinCount, 1);
  const notes = await c.prisma.notification.findMany({ where: { userId: { in: [inviter.id, colleague.id] }, kind: 'invite_joined' } });
  assert.equal(notes.length, 2);
  assert.match(notes[0].title, /Yeni Kişi (ekibinize katıldı|joined your team)/);
});

test('kayıtlı numara ekip davetiyle firma değiştiremez', { skip: !hasDb }, async () => {
  const c = await ctxP!;
  const { company, inviter, colleague } = await makeInviter();
  const invite = await c.prisma.invite.create({ data: { code: `EK${rnd()}`, inviterId: inviter.id, inviterCompanyId: company.id, relation: 'ekip' } });
  const r = await register({ phone: colleague.phone, inviteCode: invite.code });
  assert.equal(r.status, 409);
  assert.equal(r.json.error, 'already_registered_team_invite');
});

test('telefonu yazılı ekip daveti başka numarayla ve ikinci kez kullanılamaz; iptal edilen geçmez', { skip: !hasDb }, async () => {
  const c = await ctxP!;
  const { company, inviter } = await makeInviter();
  const phone = `05${rnd()}`;
  const invite = await c.prisma.invite.create({ data: { code: `EK${rnd()}`, inviterId: inviter.id, inviterCompanyId: company.id, relation: 'ekip', inviteePhone: phone } });
  const wrong = await register({ phone: `05${rnd()}`, inviteCode: invite.code });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.json.error, 'invite_phone_mismatch');
  const ok = await register({ phone, inviteCode: invite.code });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.user.companyId, company.id);

  const cancelled = await c.prisma.invite.create({ data: { code: `EK${rnd()}`, inviterId: inviter.id, inviterCompanyId: company.id, relation: 'ekip', status: 'cancelled' } });
  const r = await register({ phone: `05${rnd()}`, inviteCode: cancelled.code });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'invite_not_found');
});

test('açık ekip daveti katılım sınırına ulaşınca kapanır', { skip: !hasDb }, async () => {
  const c = await ctxP!;
  const { MAX_JOINS_PER_OPEN_INVITE } = await import('./invites');
  const { company, inviter } = await makeInviter();
  const invite = await c.prisma.invite.create({ data: { code: `EK${rnd()}`, inviterId: inviter.id, inviterCompanyId: company.id, relation: 'ekip', status: 'joined', joinCount: MAX_JOINS_PER_OPEN_INVITE } });
  const r = await register({ phone: `05${rnd()}`, inviteCode: invite.code });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'invite_used');
});

test('bağlantı daveti (tedarikçi) firmaya katmaz: firma bilgisi yine gerekir', { skip: !hasDb }, async () => {
  const c = await ctxP!;
  const { company, inviter } = await makeInviter();
  const invite = await c.prisma.invite.create({ data: { code: `TD${rnd()}`, inviterId: inviter.id, inviterCompanyId: company.id, relation: 'tedarikci' } });
  const r = await register({ phone: `05${rnd()}`, inviteCode: invite.code, accountType: 'uretici', companyName: 'Başka Firma' });
  assert.equal(r.status, 201);
  assert.notEqual(r.json.user.companyId, company.id);
  const conn = await c.prisma.connection.findFirst({ where: { requesterId: r.json.user.id, addresseeId: inviter.id } });
  assert.equal(conn?.status, 'pending');
});
