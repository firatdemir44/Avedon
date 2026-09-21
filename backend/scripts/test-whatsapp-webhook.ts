// WhatsApp → asistan (Faz 1, Adım 7) uçtan uca testi. Sunucu şu ortamla
// çalışmalı (gerçek model ve Graph API çağrılmaz):
//   ANTHROPIC_MOCK=1 WHATSAPP_MOCK=1 WHATSAPP_APP_SECRET=testgizli WHATSAPP_VERIFY_TOKEN=dogrula PORT=4001 npx tsx src/index.ts
//   API_BASE=http://localhost:4001/api node --env-file=.env --import tsx scripts/test-whatsapp-webhook.ts
import { PrismaClient } from '@prisma/client';
import { signWhatsAppBody } from '../src/whatsapp';

const prisma = new PrismaClient();
const BASE = process.env.API_BASE ?? 'http://localhost:4000/api';
const SECRET = process.env.TEST_WHATSAPP_APP_SECRET ?? 'testgizli';
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

function payload(messages: unknown[], extra: Record<string, unknown> = {}) {
  return { object: 'whatsapp_business_account', entry: [{ id: '1', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', messages, ...extra } }] }] };
}

async function post(body: unknown, sign = true) {
  const raw = JSON.stringify(body);
  const res = await fetch(`${BASE}/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(sign ? { 'X-Hub-Signature-256': signWhatsAppBody(raw, SECRET) } : {}) },
    body: raw,
  });
  return res.status;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitRow(messageId: string, until: (row: any) => boolean, timeoutMs = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const row = await prisma.whatsAppInbound.findUnique({ where: { messageId } });
    if (row && until(row)) return row;
    await sleep(200);
  }
  return prisma.whatsAppInbound.findUnique({ where: { messageId } });
}

async function main() {
  const suffix = Date.now().toString().slice(-6);
  const co = await prisma.company.create({ data: { name: `WA Test ${suffix}`, taxId: `93${suffix}`, companyCode: `WA-${suffix}` } });
  const localPhone = `0555${suffix}0`; // kayıt biçimi
  const waPhone = `90555${suffix}0`; // Meta biçimi
  const user = await prisma.user.create({
    data: { accountType: 'uretici', position: 'Test', firstName: 'WA', lastName: suffix, phone: localPhone, phoneVerified: true, companyId: co.id },
  });
  const unknownWa = `90599${suffix}9`;
  const ids = { a: `wamid.${suffix}.a`, b: `wamid.${suffix}.b`, c: `wamid.${suffix}.c`, d: `wamid.${suffix}.d`, e: `wamid.${suffix}.e`, f: `wamid.${suffix}.f`, g: `wamid.${suffix}.g` };

  try {
    console.log('Doğrulama (GET)');
    const okVerify = await fetch(`${BASE}/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=dogrula&hub.challenge=12345`);
    check('doğru token → challenge', okVerify.status === 200 && (await okVerify.text()) === '12345');
    check('yanlış token 403', (await fetch(`${BASE}/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=yanlis&hub.challenge=1`)).status === 403);
    const health = await (await fetch(`${BASE}/health`)).json();
    check('health.whatsapp: mock, appSecretSet, webhook doğrulandı', health?.whatsapp?.mock === true && health?.whatsapp?.appSecretSet === true && !!health?.whatsapp?.lastWebhookVerifiedAt, health?.whatsapp);

    console.log('İmza');
    const text = (id: string, from: string, body: string) => ({ id, from, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body } });
    check('imzasız 403', (await post(payload([text(ids.a, waPhone, 'x')]), false)) === 403);
    const badSig = await fetch(`${BASE}/whatsapp/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': 'sha256=deadbeef' }, body: JSON.stringify(payload([text(ids.a, waPhone, 'x')])) });
    check('yanlış imza 403', badSig.status === 403);
    check('imzasız istek kayıt bırakmadı', (await prisma.whatsAppInbound.findUnique({ where: { messageId: ids.a } })) === null);

    console.log('Bilinmeyen numara');
    check('200 hemen döner', (await post(payload([text(ids.b, unknownWa, 'merhaba')]))) === 200);
    const rowB = await waitRow(ids.b, (r) => r.status !== 'received');
    check('durum unknown_user, kayıt yönlendirmesi', rowB?.status === 'unknown_user' && rowB?.replyBody.includes('kayıtlı değil'), rowB);
    check('asistan çağrılmadı (thread yok)', (await prisma.assistantThread.count({ where: { channel: 'whatsapp', userId: user.id } })) === 0);

    console.log('Kayıtlı kullanıcı → asistan (sahte model)');
    check('200', (await post(payload([text(ids.c, waPhone, '/yarnCount {"value":30,"system":"ne"}')]))) === 200);
    const rowC = await waitRow(ids.c, (r) => r.status !== 'received');
    check('durum answered', rowC?.status === 'answered', rowC);
    check('kullanıcı ve whatsapp ipliği bağlandı', rowC?.userId === user.id && !!rowC?.threadId, rowC);
    check('cevapta araç özeti (19,7 tex)', rowC?.replyBody.includes('19,7 tex'), rowC?.replyBody);
    const thread = await prisma.assistantThread.findUnique({ where: { id: rowC!.threadId! }, include: { messages: true } });
    check('whatsapp kanalında 2 mesaj kayıtlı', thread?.channel === 'whatsapp' && thread?.messages.length === 2, thread?.messages.length);
    const appThreads = await fetch(`${BASE}/assistant/threads`, { headers: { Authorization: `Bearer ${(await import('../src/auth')).signSessionToken(user.id)}` } });
    check('uygulama sohbet listesinde whatsapp ipliği görünmez', !((await appThreads.json()) as any).threads?.some((t: any) => t.id === rowC?.threadId));

    console.log('Tekrar koruması');
    check('aynı mesaj tekrar 200', (await post(payload([text(ids.c, waPhone, '/yarnCount {"value":30,"system":"ne"}')]))) === 200);
    await sleep(800);
    check('tek kayıt, tek işlem', (await prisma.whatsAppInbound.count({ where: { messageId: ids.c } })) === 1 && (await prisma.assistantMessage.count({ where: { threadId: rowC!.threadId! } })) === 2);

    console.log('Metin dışı mesaj ve durum bildirimi');
    check('ses mesajı 200', (await post(payload([{ id: ids.d, from: waPhone, timestamp: '1758000000', type: 'audio', audio: { id: 'x' } }]))) === 200);
    const rowD = await waitRow(ids.d, (r) => r.status !== 'received');
    check('non_text: fotoğraf okunabildiğini söyler', rowD?.status === 'non_text' && rowD?.replyBody.includes('FOTOĞRAFI'), rowD);

    console.log('Etiket fotoğrafı → ürün taslağı');
    const fakeImage = Buffer.from('sahte-etiket-fotografi').toString('base64');
    check('fotoğraf 200', (await post(payload([{ id: ids.f, from: waPhone, timestamp: '1758000000', type: 'image', image: { id: fakeImage } }]))) === 200);
    const rowF = await waitRow(ids.f, (r) => r.status !== 'received');
    check('taslak oluştu ve özetle cevaplandı', rowF?.status === 'draft_created' && rowF.replyBody.startsWith('Etiketi okudum:') && rowF.replyBody.includes('Fiyat ve stok etiketten alınmaz'), rowF);
    const drafts = await prisma.productDraft.findMany({ where: { userId: user.id } });
    check('taslak kaydı: sahibi, firması, fotoğrafı ve çıkarımı var', drafts.length === 1 && drafts[0].companyId === co.id && drafts[0].imageUrl.startsWith('data:image/jpeg;base64,') && JSON.parse(drafts[0].extractionJson).extraction != null, drafts[0]?.id);
    check('ÜRÜN oluşturulmadı (yalnızca taslak)', (await prisma.product.count({ where: { companyId: co.id } })) === 0);
    const note = await prisma.notification.findFirst({ where: { userId: user.id, kind: 'product_draft' } });
    check('uygulama bildirimi taslağı gösterir', !!note && JSON.parse(note.dataJson).draftId === drafts[0]?.id, note);
    const token = (await import('../src/auth')).signSessionToken(user.id);
    const base = BASE;
    const api = async (method: string, path: string) => { const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}` } }); return { status: r.status, json: (await r.json().catch(() => null)) as any }; };
    const list = await api('GET', '/product-drafts');
    check('taslak listesi hafif (fotoğraf yok)', list.json?.drafts?.length === 1 && !JSON.stringify(list.json).includes('base64'), list.json);
    const one = await api('GET', `/product-drafts/${drafts[0]?.id}`);
    check('taslak detayı: fotoğraf + çıkarım', one.json?.draft?.imageUrl?.startsWith('data:image/') && one.json.draft.outcome?.extraction != null, one.status);
    check('kullanıldı işaretlenince listeden düşer ve fotoğraf silinir', (await api('POST', `/product-drafts/${drafts[0]?.id}/used`)).status === 204 && (await api('GET', '/product-drafts')).json?.drafts?.length === 0 && (await prisma.productDraft.findUnique({ where: { id: drafts[0]!.id } }))?.imageUrl === '');
    check('okunamayan etiket: taslak yok, yönlendirme var', (await post(payload([{ id: ids.g, from: waPhone, timestamp: '1758000000', type: 'image', image: { id: fakeImage, caption: 'merhaba nasılsınız' } }]))) === 200);
    const rowG = await waitRow(ids.g, (r) => r.status !== 'received');
    check('photo_unreadable', rowG?.status === 'photo_unreadable' && (await prisma.productDraft.count({ where: { userId: user.id, status: 'new' } })) === 0, rowG);
    check('yalnızca durum bildirimi 200, kayıt yok', (await post(payload([], { statuses: [{ id: ids.e, status: 'delivered' }] }))) === 200);
    await sleep(300);
    check('durum bildirimi kayıt bırakmadı', (await prisma.whatsAppInbound.findUnique({ where: { messageId: ids.e } })) === null);
    check('bozuk gövde 200 (Meta yeniden göndermesin)', (await post({ object: 'x' })) === 200);
  } finally {
    await prisma.whatsAppInbound.deleteMany({ where: { messageId: { in: Object.values(ids) } } });
    await prisma.productDraft.deleteMany({ where: { userId: user.id } });
    await prisma.notification.deleteMany({ where: { userId: user.id } });
    await prisma.assistantThread.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
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
