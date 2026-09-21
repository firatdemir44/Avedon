// Anlık bildirim (Web Push) uçtan uca API testi. Sahte kipte ikinci sunucu gerekir:
//   PORT=4001 PUSH_MOCK=1 node --env-file=.env --import tsx src/index.ts
//   API_BASE=http://localhost:4001/api node --env-file=.env --import tsx scripts/test-push-api.ts
import { PrismaClient } from '@prisma/client';
import { signSessionToken } from '../src/auth';

const prisma = new PrismaClient();
const BASE = process.env.API_BASE ?? 'http://localhost:4001/api';
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
  const mk = (n: number) => prisma.user.create({ data: { accountType: 'bireysel', position: 'Test', firstName: `Push${n}`, lastName: 'Test', phone: `0593${suffix}${n}`, phoneVerified: true } });
  const a = await mk(1);
  const b = await mk(2);
  const A = signSessionToken(a.id);
  const Bt = signSessionToken(b.id);
  const endpoint = `https://push.example.test/${suffix}`;
  const keys = { p256dh: 'BPdeneme-anahtar-0123456789', auth: 'deneme-auth-0123' };

  try {
    console.log('Abonelik');
    const pk = await api('GET', '/push/public-key');
    check('açık anahtar ucu oturumsuz', pk.status === 200 && pk.json?.enabled === true, pk.json);
    check('oturumsuz abonelik 401', (await api('POST', '/push/subscribe', undefined, { endpoint, keys })).status === 401);
    check('http adres reddedilir', (await api('POST', '/push/subscribe', A, { endpoint: 'http://x.test/1', keys })).status === 400);
    check('abone olundu', (await api('POST', '/push/subscribe', A, { endpoint, keys, userAgent: 'test' })).status === 201);
    check('aynı cihaz ikinci kez: tek kayıt', (await api('POST', '/push/subscribe', A, { endpoint, keys })).status === 201 && (await prisma.pushSubscription.count({ where: { endpoint } })) === 1);
    check('durum: 1 cihaz', (await api('GET', '/push/status', A)).json?.devices === 1);
    check('aynı cihazda başka hesap: abonelik ona geçer', (await api('POST', '/push/subscribe', Bt, { endpoint, keys })).status === 201 && (await prisma.pushSubscription.findUnique({ where: { endpoint } }))?.userId === b.id);
    check('başkasının aboneliği silinemez', (await api('POST', '/push/unsubscribe', A, { endpoint })).status === 204 && (await prisma.pushSubscription.count({ where: { endpoint } })) === 1);

    console.log('Gönderim (sahte kip)');
    check('deneme bildirimi', (await api('POST', '/push/test', Bt)).status === 200);
    await prisma.connection.create({ data: { requesterId: a.id, addresseeId: b.id, status: 'accepted', respondedAt: new Date() } });
    const conv = await api('POST', '/conversations', A, { userId: b.id });
    await api('POST', `/conversations/${conv.json.conversation.id}/messages`, A, { body: 'Merhaba, numune hazır.' });
    const box = (await api('GET', '/push/mock-outbox', Bt)).json?.items ?? [];
    const msg = box.find((m: any) => m.payload.kind === 'message');
    check('yeni mesajda karşı tarafa bildirim', !!msg && msg.payload.title === 'Push1 Test' && msg.payload.body.includes('numune') && msg.payload.data.conversationId === conv.json.conversation.id, box);
    check('gönderene bildirim gitmez', !((await api('GET', '/push/mock-outbox', A)).json?.items ?? []).some((m: any) => m.payload.kind === 'message'));
    // Uygulama içi bildirim yazılınca anlık bildirim de gider (bağlantı isteği).
    const c = await mk(3);
    try {
      const reqc = await api('POST', '/connections', signSessionToken(c.id), { addresseeId: b.id });
      const box2 = (await api('GET', '/push/mock-outbox', Bt)).json?.items ?? [];
      check('uygulama içi bildirimle birlikte anlık bildirim', reqc.status < 300 && box2.some((m: any) => /^connection/.test(m.payload.kind)), { status: reqc.status, kinds: box2.map((m: any) => m.payload.kind) });
    } finally {
      await prisma.notification.deleteMany({ where: { userId: { in: [b.id, c.id] } } });
      await prisma.connection.deleteMany({ where: { OR: [{ requesterId: c.id }, { addresseeId: c.id }] } });
      await prisma.user.deleteMany({ where: { id: c.id } });
    }
    check('kendi aboneliğini siler', (await api('POST', '/push/unsubscribe', Bt, { endpoint })).status === 204 && (await prisma.pushSubscription.count({ where: { endpoint } })) === 0);
  } finally {
    const ids = [a.id, b.id];
    await prisma.pushSubscription.deleteMany({ where: { userId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.conversation.deleteMany({ where: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] } });
    await prisma.connection.deleteMany({ where: { OR: [{ requesterId: { in: ids } }, { addresseeId: { in: ids } }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
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
